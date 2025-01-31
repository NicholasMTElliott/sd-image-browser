using System.Text;
using System.Text.RegularExpressions;
using System.Security.Cryptography;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Processing;
using SixLabors.ImageSharp.Formats.Webp;
using SixLabors.ImageSharp.Formats.Png;
using FFMpegCore;
using FFMpegCore.Pipes;

namespace ImageScanner;

public enum ProcessingStatus
{
    None = 0,
    Processing,
    Done,
    Error
}

/// <summary>
/// The ImageProcessor class handles scanning directories for images, converting them
/// to webp when necessary, reading and storing metadata, deleting images, and
/// pinning images to a special directory.
/// </summary>
public class ImageProcessor
{
    public readonly static string[] SupportedImages = ["png", "jpg", "webp", "jpeg", "gif"];
    public readonly static string[] SupportedVideos = ["mp4"];
    private ProcessingStatus _currentStatus = ProcessingStatus.None;
    private Timer? _timer;
    private readonly SemaphoreSlim _lock = new SemaphoreSlim(1);
    private readonly string _sourceDir;
    private readonly DbContext _context;
    private readonly ILogger<ImageProcessor> _logger;
    private readonly WebpEncoder _thumbnailEncoder  = new WebpEncoder()
        {
            Quality = 50
        };

    private readonly WebpEncoder _imageEncoder  = new WebpEncoder()
        {
            Quality = 90
        };

    public string CurrentStatus => Enum.GetName(typeof(ProcessingStatus), _currentStatus) ?? "Error";

    // Constructor to initialize the ImageProcessor with source directory and database context
    public ImageProcessor(string sourceDir, DbContext context, ILogger<ImageProcessor> logger)
    {
        if (string.IsNullOrWhiteSpace(sourceDir))
        {
            throw new ArgumentException($"'{nameof(sourceDir)}' cannot be null or whitespace.", nameof(sourceDir));
        }

        _sourceDir = sourceDir;
        _context = context ?? throw new ArgumentNullException(nameof(context));
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    }

    // Method to queue an inventory update
    public void QueueInventory()
    {
        _ = ExecuteInventoryUpdate();
    }

    // Method to start a timer that periodically triggers inventory updates
    public void StartTimer()
    {
        _timer = new Timer((t) => {
            _ = ExecuteInventoryUpdate(true);
        }, null, TimeSpan.FromSeconds(1), TimeSpan.FromMinutes(15) );
    }

    /// <summary>
    /// Starts an asynchronous job that scans for new images, processes them, and
    /// removes any images no longer present. The result is tracked in _currentStatus.
    /// </summary>
    private async Task ExecuteInventoryUpdate(bool newOnly = false)
    {
        _logger.LogInformation("Starting inventory update at {Timestamp}", DateTimeOffset.UtcNow);
        await _lock.WaitAsync();
        try
        {
            _logger.LogInformation("START: {Name}", nameof(ExecuteInventoryUpdate));
            _currentStatus = ProcessingStatus.Processing;
            var timestamp = DateTimeOffset.UtcNow;
            _logger.LogInformation("Processing directory {SourceDir} with status {Status}", _sourceDir, _currentStatus);
            //await IterateDirectory(_sourceDir);

            var files = Directory.EnumerateFiles(_sourceDir, "*", SearchOption.AllDirectories)
                .Where(f => SupportedImages.Contains(Path.GetExtension(f).TrimStart('.').ToLower()) || 
                            SupportedVideos.Contains(Path.GetExtension(f).TrimStart('.').ToLower()));
            _logger.LogInformation("Found {Count} eligable files in {SourceDir}", files.Count(), _sourceDir);
            // split this into two sections: Items that don't already exist in the database and then items that do.
            var newFiles = files.Where(f => _context.GetImageEntryAsync(Path.GetRelativePath(_sourceDir, f)).Result == null);            
            foreach(var file in newFiles)
            {
                await ScanFile(file);
            }

            if(!newOnly)
            {
                var oldFiles = files.Where(f => !newFiles.Contains(f));
                foreach(var file in oldFiles)
                {
                    await ScanFile(file);
                }
                await _context.ClearUnseen(timestamp);
            }            
            _currentStatus = ProcessingStatus.Done;
        }
        catch(Exception ex)
        {
            _currentStatus = ProcessingStatus.Error;
            _logger.LogError(ex, "Exception in {Name}: {Message}", nameof(ExecuteInventoryUpdate), ex.Message);
            _logger.LogError(ex.StackTrace);
            throw;
        }
        finally
        {
            _logger.LogInformation("Completed inventory update. Final status: {Status}", _currentStatus);
            _lock.Release();
            _logger.LogInformation("END: {Name}", nameof(ExecuteInventoryUpdate));
        }
    }

    /// <summary>
    /// Recursively iterates through subdirectories and processes any discovered image files.
    /// </summary>
    private async Task IterateDirectory(string dir)
    {
        var startTime = DateTimeOffset.UtcNow;
        _logger.LogInformation("Processing directory {Directory}", dir);
        
        _logger.LogInformation(nameof(IterateDirectory));
        _logger.LogInformation(dir);
        if(!Directory.Exists(dir))
        {
            return;
        }
        var path = Path.GetRelativePath(_sourceDir, dir);
        var subdirs = Directory.EnumerateDirectories(dir);
        foreach(var subdir in subdirs)
        {
            try
            {
                await IterateDirectory(subdir);
            }
            catch(Exception ex)
            {
                _logger.LogError(ex, "Exception processing subdirectory {Subdir}: {Message}", subdir, ex.Message);
                _logger.LogError(ex.StackTrace);
            }
            await Task.Delay(0);
        }

        var files = Directory.EnumerateFiles(dir);
        var fileCount = files.Count();
        _logger.LogInformation("Found {Count} files in directory {Directory}", fileCount, dir);
        var processedCount = 0;
        
        foreach(var file in files)
        {
            await ScanFile(file);
            processedCount++;
            _logger.LogDebug("Progress: {Processed}/{Total} files in {Directory}", 
                processedCount, fileCount, dir);
        }
        
        var duration = DateTimeOffset.UtcNow - startTime;
        _logger.LogInformation("Completed directory {Directory} in {Duration}ms", 
            dir, duration.TotalMilliseconds);
    }

    /// <summary>
    /// Scans an individual file: verifies it's supported, converts if required,
    /// extracts metadata, and updates the database with new or updated image entries.
    /// </summary>
    private async Task ScanFile(string file)
    {
        var startTime = DateTimeOffset.UtcNow;
        _logger.LogDebug("Processing file {File}", file);
        
        if(!File.Exists(file))
        {
            _logger.LogInformation("Does not exist");
            return;
        }

        // Fix the extension parsing
        var fileExtension = Path.GetExtension(file).TrimStart('.').ToLower();
        if(string.IsNullOrEmpty(fileExtension))
        {
            _logger.LogDebug("Skipping file without extension: {File}", file);
            return;
        }

        bool isVideo = SupportedVideos.Contains(fileExtension);
        if(!SupportedImages.Contains(fileExtension) && !isVideo)
        {
            return;
        }

        // Convert non-webp and non-gif images to webp format
        if(!isVideo && fileExtension != "gif" && fileExtension != "webp")
        {
            _logger.LogInformation("Converting {File} ({Size} bytes) from {OriginalFormat} to WebP", 
                file, new FileInfo(file).Length, fileExtension);
            var destinationFilename = Path.Combine(
                GetDirectoryNameWithCheck(file),
                Path.GetFileNameWithoutExtension(file)+".webp");

            // Convert
            _logger.LogInformation("Converting {File} to {DestinationFilename}", file, destinationFilename);
            using(var inStream = new BufferedStream(File.OpenRead(file), 5_000_000))
            using(var outStream = new BufferedStream(File.OpenWrite(destinationFilename), 5_000_000))
            using (Image image = Image.Load(inStream))
            {
                if(fileExtension == "png")
                {
                    PngMetadata md = image.Metadata.GetPngMetadata();
                    if(md.TextData.Any())
                    {
                        var metadataFilename = Path.Combine(
                            GetDirectoryNameWithCheck(file),
                            Path.GetFileNameWithoutExtension(file)+".txt");
                        using(var metadataStream = File.OpenWrite(metadataFilename))
                        using(var writer = new StreamWriter(metadataStream))
                        {
                            foreach(var chunk in md.TextData)
                            {
                                writer.WriteLine(chunk.Value);
                            }
                            await writer.FlushAsync();
                            await metadataStream.FlushAsync();
                        }
                    }
                }
                if(image.Width > image.Height)
                {
                    if(image.Width > 4096)
                    {
                        _logger.LogInformation("Resizing width down to 4096");
                        image.Mutate(c => c.Resize(new ResizeOptions {
                            Size = new Size { Width = 4096 },
                            Mode = ResizeMode.Max
                        }));
                    }
                }
                else
                {
                    if(image.Height > 4096)
                    {
                        _logger.LogInformation("Resizing height down to 4096");
                        image.Mutate(c => c.Resize(new ResizeOptions {
                            Size = new Size { Height = 4096 },
                            Mode = ResizeMode.Max
                        }));
                    }
                }
                await image.SaveAsWebpAsync(outStream, _imageEncoder);
                await outStream.FlushAsync();
            }
            await Task.Delay(100);
            if(File.Exists(destinationFilename))
            {
                File.Delete(file);           
                _logger.LogInformation("Converted {File} to {DestinationFilename}", file, destinationFilename);
            }
            else
            {
                _logger.LogInformation("Destination image {DestinationFilename} did not exist after creation", destinationFilename);
                return;
            } 
            file = destinationFilename;
            fileExtension = "webp";
        }

        var fileInfo = new FileInfo(file);
        var size = fileInfo.Length;
        var path = Path.GetRelativePath(_sourceDir, GetDirectoryNameWithCheck(file));
        var name = Path.GetFileNameWithoutExtension(file);
        var relativeFilename = Path.GetRelativePath(_sourceDir, file);
        var existingEntry = await _context.GetImageEntryAsync(relativeFilename);
        if(existingEntry != null)
        {
            // We already have this file
            await _context.UpdateLastSeenAsync(existingEntry.Id);
            return;
        }

        // Process this image and read any associated attribute information
        var tags = new List<string>();
        var metadata = "";
        var metadataFile = Path.Combine(GetDirectoryNameWithCheck(file), Path.GetFileNameWithoutExtension(file) + ".txt" );
        if(File.Exists(metadataFile))
        {
            _logger.LogInformation("Getting Metadata");
            metadata =  UTF8Encoding.UTF8.GetString(await File.ReadAllBytesAsync(metadataFile));
            tags = Regex.Split(metadata.Split("\n")[0], "[,|]")
                .Select(tag => Regex.Replace(tag.ToLower().Trim(), "[{()}]", "", RegexOptions.Multiline))
                .ToList();
        }

        var hash = "";
        // Calculate the hash of the file
        using(var stream = new BufferedStream(File.OpenRead(file), Math.Min(
           (size > (long)int.MaxValue) ? int.MaxValue : (int)size, 40_000_000)
            ))
        {
            var sha = SHA256.Create();
            byte[] checksum = sha.ComputeHash(stream);
            hash = BitConverter.ToString(checksum).Replace("-", String.Empty);
        }

        _logger.LogDebug("File {File} hash: {Hash}", file, hash);
        
        var existingPreview = await _context.GetImagePreviewAsync(hash);
        int? durationSeconds = null;
        if(isVideo)
        {
            try
            {
                var mediaInfo = await FFProbe.AnalyseAsync(file);
                durationSeconds = (int)mediaInfo.Duration.TotalSeconds;
                
                // Generate thumbnail from video
                if(existingPreview == null)
                {
                    using var memoryStream = new MemoryStream();
                    await FFMpegArguments
                        .FromFileInput(file)
                        .OutputToPipe(new StreamPipeSink(memoryStream), options => options
                            .Seek(TimeSpan.FromSeconds(1)) // Grab frame at 1 second
                            .WithVideoCodec("mjpeg")
                            .WithCustomArgument("-vframes 1")
                            .WithCustomArgument("-s 96x96"))
                        .ProcessAsynchronously();

                    memoryStream.Position = 0;
                    var preview = new ImagePreview(hash, memoryStream.ToArray(), size, "jpg");
                    await _context.CreateImagePreviewAsync(preview);
                    _logger.LogInformation("Created thumbnail for video {File}", file);
                }
            }
            catch(Exception ex)
            {
                _logger.LogError(ex, "Failed to process video file {File}", file);
                return;
            }
        }
        else if(existingPreview == null)
        {
            // Create a thumbnail
            using(var stream = new BufferedStream(File.OpenRead(file), Math.Min(
            (size > (long)int.MaxValue) ? int.MaxValue : (int)size, 5_000_000)
                ))
            using(var memoryStream = new MemoryStream())
            {
                using (Image image = Image.Load(stream))
                {
                    image.Mutate(x => x.Resize(new ResizeOptions{
                        Mode = ResizeMode.Pad,
                        Size = new Size(96, 96)
                    }));
                    await image.SaveAsWebpAsync(memoryStream, _thumbnailEncoder);
                }

                memoryStream.Seek(0, SeekOrigin.Begin);
                var preview = new ImagePreview(hash, memoryStream.GetBuffer(), size, fileExtension);
                await _context.CreateImagePreviewAsync(preview);
                _logger.LogInformation("Created new thumbnail for {File}", file);
            }
        }
        else
        {
            _logger.LogDebug("Using existing thumbnail for {File}", file);
        }
        
        var imageEntry = new ImageEntry(Guid.NewGuid().ToString(), relativeFilename, path, name, fileExtension, String.Join('|', tags),
            hash, metadata, DateTimeOffset.UtcNow.ToString("o"), DateTimeOffset.UtcNow.ToString("o"));
        await _context.CreateImageEntryAsync(imageEntry);
        
        var duration = DateTimeOffset.UtcNow - startTime;
        _logger.LogInformation("Completed processing {File} in {Duration}ms", 
            file, duration.TotalMilliseconds);
    }

    /// <summary>
    /// Deletes an image and corresponding .txt file from the filesystem and database.
    /// </summary>
    public async Task<bool> DeleteImage(Guid imageId)
    {
        _logger.LogInformation("Attempting to delete image {ImageId}", imageId);
        var entry = await _context.GetImageEntryAsync(imageId);
        if(entry == null)
        {
            _logger.LogInformation("No entry for {ImageId}", imageId);
            return false;
        }

        // Remove from the context
        await _context.RemoveEntry(imageId, entry.Hash);

        var file = entry.FullFileName;
        if(!File.Exists(Path.Combine(_sourceDir,file)))
        {
            _logger.LogInformation("!File.Exists({File})", file);
            return false;
        }

        var directory = Path.Combine(_sourceDir,entry.Path);
        var fileWithoutExtension = entry.Name;
        var others = Directory.EnumerateFiles(directory, fileWithoutExtension+".*");
        foreach(var other in others)
        {
            try
            {
                _logger.LogDebug("Deleting associated file: {File}", other);
                File.Delete(other);
            }
            catch(Exception ex)
            {
                _logger.LogError(ex, "Exception thrown deleting {Other}: {Message}", other, ex.Message);
            }
        }
        _logger.LogInformation("Successfully deleted image {ImageId} and associated files", imageId);
        return true;
    }

    /// <summary>
    /// Pins an image by copying it and any .txt file to a special directory, and updates the entry.
    /// </summary>
    internal async Task<ImageEntry?> PinImage(Guid imageId)
    {
        _logger.LogInformation("Pinning image {ImageId}", imageId);
        try
        {
            var entry = await _context.GetImageEntryAsync(imageId);
            if (entry == null)
            {
                _logger.LogInformation("No image entry found for the provided ID.");
                return null;
            }

            var destinationPinnedDirectory = Path.Combine(_sourceDir, "_pinned");
            var destinationFullFilename = Path.Combine(destinationPinnedDirectory, $"_{entry.Name}.{entry.Id}.{entry.Extension}");
            var originalDirectory = Path.Combine(_sourceDir, entry.Path);
            var sourceFullFilePath = Path.Combine(_sourceDir, entry.FullFileName);

            Directory.CreateDirectory(destinationPinnedDirectory);
            _logger.LogDebug("Created pinned directory: {Directory}", destinationPinnedDirectory);
            File.Copy(sourceFullFilePath, destinationFullFilename);
            _logger.LogInformation("Copied from {SourceFullFilePath} to {DestinationFullFilename}", sourceFullFilePath, destinationFullFilename);

            try
            {
                var sidecarSource = Path.Combine(originalDirectory, entry.Name + ".txt");
                var sidecarDestination = Path.Combine(destinationPinnedDirectory, $"_{entry.Name}.{entry.Id}.txt");
                File.Copy(sidecarSource, sidecarDestination);
                _logger.LogInformation("Copied from {SidecarSource} to {SidecarDestination}", sidecarSource, sidecarDestination);
            }
            catch
            {
                // Ignore missing sidecar file
            }

            // Create updated entry with new path information
            var updatedEntry = entry with 
            { 
                FullFileName = Path.GetRelativePath(_sourceDir, destinationFullFilename),
                Path = "_pinned"
            };
            await _context.UpdateImageEntry(updatedEntry);

            // Clean up original files
            foreach (var file in Directory.EnumerateFiles(originalDirectory))
            {
                if (Path.GetFileName(file).StartsWith(entry.Name))
                {
                    _logger.LogInformation("Deleting {File}", file);
                    File.Delete(file);
                }
            }
            _logger.LogInformation("Successfully pinned image {ImageId}", imageId);
            return updatedEntry;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error pinning image: {Message}", ex.Message);
            return null;
        }
    }

    /// <summary>
    /// Returns the directory name for a given file. Throws an exception if it fails.
    /// This ensures we do not operate on null directories.
    /// </summary>
    private string GetDirectoryNameWithCheck(string fileName)
    {
        var directoryName = Path.GetDirectoryName(fileName);
        if (directoryName is null)
        {
            throw new ArgumentException($"Cannot get directory name for {fileName}");
        }
        return directoryName;
    }
}
