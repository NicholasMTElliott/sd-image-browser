
using System.Text;
using System.Text.RegularExpressions;
using System.Security.Cryptography;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Processing;
using SixLabors.ImageSharp.Formats.Webp;
using SixLabors.ImageSharp.Formats;
using SixLabors.ImageSharp.Formats.Png;

namespace ImageScanner;

public enum ProcessingStatus
{
    None = 0,
    Processing,
    Done,
    Error
}

public class ImageProcessor
{
    public readonly static string[] SupportedImages = ["png", "jpg", "webp", "jpeg", "gif"];
    private ProcessingStatus _currentStatus = ProcessingStatus.None;
    private Timer _timer;
    private readonly SemaphoreSlim _lock = new SemaphoreSlim(1);
    private readonly string _sourceDir;
    private readonly DbContext _context;
    private readonly WebpEncoder _thumbnailEncoder  = new WebpEncoder()
        {
            Quality = 50
        };

    private readonly WebpEncoder _imageEncoder  = new WebpEncoder()
        {
            Quality = 90
        };

    public string CurrentStatus => Enum.GetName(typeof(ProcessingStatus), _currentStatus) ?? "Error";


    public ImageProcessor(string sourceDir, DbContext context)
    {
        if (string.IsNullOrWhiteSpace(sourceDir))
        {
            throw new ArgumentException($"'{nameof(sourceDir)}' cannot be null or whitespace.", nameof(sourceDir));
        }

        _sourceDir = sourceDir;
        _context = context ?? throw new ArgumentNullException(nameof(context));
    }


    public void QueueInventory()
    {
        _ = ExecuteInventoryUpdate();
    }

    public void StartTimer()
    {
        _timer = new Timer((t) => {
            _ = ExecuteInventoryUpdate();
        }, null, TimeSpan.FromSeconds(1), TimeSpan.FromMinutes(15) );
    }

    private async Task ExecuteInventoryUpdate()
    {
        Console.WriteLine(nameof(ExecuteInventoryUpdate));
        await _lock.WaitAsync();
        try
        {
            _currentStatus = ProcessingStatus.Processing;
            await IterateDirectory(_sourceDir);
            _currentStatus = ProcessingStatus.Done;
        }
        catch(Exception)
        {
            _currentStatus = ProcessingStatus.Error;
            throw;
        }
        finally
        {
            _lock.Release();
        }
    }

    private async Task IterateDirectory(string dir)
    {
        Console.WriteLine(nameof(IterateDirectory));
        Console.WriteLine(dir);
        if(!Directory.Exists(dir))
        {
            return;
        }
        var path = Path. GetRelativePath(_sourceDir, dir);
        var subdirs = Directory.EnumerateDirectories(dir);
        foreach(var subdir in subdirs)
        {
            try
            {
                await IterateDirectory(subdir);
            }
            catch(Exception ex)
            {
                await Console.Error.WriteLineAsync($"Exception processing subdirectory {subdir}: ({ex.GetType().Name}) {ex.Message}");
                await Console.Error.WriteLineAsync(ex.StackTrace);
            }
            await Task.Delay(0);
        }

        var files = Directory.EnumerateFiles(dir);
        foreach(var file in files)
        {
            await ScanFile(file);
        }
    }

    private async Task ScanFile(string file)
    {
        if(!File.Exists(file))
        {
            Console.WriteLine("Does not exist");
            return;
        }

        var fileExtension =  Path.GetExtension(file).ToLower().Substring(1); // Remove the dot
        if(!SupportedImages.Any(ext => ext.ToLower() == fileExtension))
        {
            Console.WriteLine($"{fileExtension} not supported");
            return;
        }

        // Get the file size and see if we already have this entry in the db
        // If this is anything other than a gif or webp, then we will convert it
        if(fileExtension != "gif" && fileExtension != "webp")
        {
            var destinationFilename = Path.Combine(
                Path.GetDirectoryName(file), 
                Path.GetFileNameWithoutExtension(file)+".webp");

            // Convert
            Console.WriteLine($"Converting {file} to {destinationFilename}");
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
                            Path.GetDirectoryName(file), 
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
                        Console.WriteLine("Resizing width down to 4096");
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
                        Console.WriteLine("Resizing height down to 4096");
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
                Console.WriteLine($"Converted {file} to {destinationFilename}");
            }
            else
            {
                Console.WriteLine($"Destination image {destinationFilename} did not exist after creation");
                return;
            } 
            file = destinationFilename;
            fileExtension = "webp";
        }

        var fileInfo = new FileInfo(file);
        var size = fileInfo.Length;
        var path = Path.GetRelativePath(_sourceDir, Path.GetDirectoryName(file));
        var name = Path.GetFileNameWithoutExtension(file);
        var relativeFilename = Path.GetRelativePath(_sourceDir, file);
        var existingEntry = await _context.GetImageEntryAsync(relativeFilename);
        if(existingEntry != null)
        {
            // We already have this file
            await _context.UpdateLastSeenAsync(existingEntry.Id);
            return;
        }

        // process this image!
        // try and read any associated attribute information
        var tags = new List<string>();
        var metadata = "";
        var metadataFile = Path.Combine(Path.GetDirectoryName(file)!, Path.GetFileNameWithoutExtension(file) + ".txt" );
        if(File.Exists(metadataFile))
        {
            Console.WriteLine("Getting Metadata");
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

        var existingPreview = await _context.GetImagePreviewAsync(hash);
        if(existingPreview == null)
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
            }
        }
        
        var imageEntry = new ImageEntry(Guid.NewGuid().ToString(), relativeFilename, path, name, fileExtension, String.Join('|', tags),
            hash, metadata, DateTimeOffset.UtcNow.ToString("o"), DateTimeOffset.UtcNow.ToString("o"));
        await _context.CreateImageEntryAsync(imageEntry);
    }

    public async Task<bool> DeleteImage(Guid imageId)
    {
        var entry = await _context.GetImageEntryAsync(imageId);
        if(entry == null)
        {
            return false;
        }

        var file = entry.FullFileName;
        if(!File.Exists(file))
        {
            return false;
        }

        var directory = entry.Path;
        var fileWithoutExtension = entry.Name;
        var others = Directory.EnumerateFiles(directory, fileWithoutExtension+"*");
        foreach(var other in others)
        {
            Console.WriteLine("DELETING OTHER" + other);
            try
            {
                File.Delete(other);
            }
            catch(Exception ex)
            {
                Console.WriteLine($"Exception thrown deleting {other}: ({ex.GetType().Name}) {ex.Message}");
            }
        }
        // Remove from the context
        await _context.RemoveEntry(imageId, entry.Hash);
        return true;
    }

    internal async Task PinImage(Guid imageId)
    {
        
    }
}