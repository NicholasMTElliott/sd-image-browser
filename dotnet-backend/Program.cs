using ImageScanner;
using Microsoft.AspNetCore.Mvc;

try
{
    //const string sourceDir = process.env.IMAGES_ROOT_DIR || './samples';
    string sourceDir = Environment.GetEnvironmentVariable("IMAGES_ROOT_DIR") ?? "./samples";

    var builder = WebApplication.CreateBuilder(args);
    builder.Logging.ClearProviders();
    builder.Logging.AddConsole();
    var app = builder.Build();

    var logger = app.Services.GetRequiredService<ILogger<ImageProcessor>>();
    using var context = new DbContext(sourceDir, true);
    await context.MigrateAsync();
    var processor = new ImageProcessor(sourceDir, context, logger);
    processor.StartTimer();

    // Set up a periodic background scan
    app.MapGet("/api/status", () => {
        return Results.Json($"\"{processor.CurrentStatus}\"");
    });

    app.MapGet("/api/images", async ([FromQuery]int? start, [FromQuery]int? take) => {
        try
        {
            // List all known images
            using (var context = new DbContext(sourceDir))
            {
                var listOfImages = await context.GetImageEntriesAsync(start, take);
                return Results.Json(listOfImages);
            }
        }
        catch(Exception ex)
        {
            Console.WriteLine($"Exception thrown invoking GET /api/images: ({ex.GetType()}) {ex.Message}");
            Console.WriteLine(ex.ToString());
            return Results.InternalServerError($"Exception thrown invoking GET /api/images: ({ex.GetType()}) {ex.Message}");
        }
    });

    app.MapPost("/api/images", () => {
        try
        {
            processor.QueueInventory();
            return Results.NoContent();
        }
        catch(Exception ex)
        {
            Console.WriteLine($"Exception thrown invoking POST /api/images: ({ex.GetType()}) {ex.Message}");
            Console.WriteLine(ex.ToString());
            return Results.InternalServerError($"Exception thrown invoking POST /api/images: ({ex.GetType()}) {ex.Message}");
        }
    });

    app.MapGet("/api/thumbnails/{imageId}", async (Guid imageId) => {
        try
        {
            // List all known images
            using (var context = new DbContext(sourceDir))
            {
                var entry = await context.GetImageEntryAsync(imageId);
                if(entry == null)
                {
                    return Results.NotFound();
                }
                var preview = await context.GetImagePreviewAsync(entry.Hash);
                if(preview == null)
                {
                    return Results.NotFound();
                }

                return Results.Bytes(preview.Preview, "image/webp");
            }    
        }
        catch(Exception ex)
        {
            Console.WriteLine($"Exception thrown invoking GET /api/thumbnails/imageId: ({ex.GetType()}) {ex.Message}");
            Console.WriteLine(ex.ToString());
            return Results.InternalServerError($"Exception thrown invoking GET /api/thumbnails/imageId ({ex.GetType()}) {ex.Message}");
        }
    });

    app.MapGet("/api/images/{imageId}", async (Guid imageId, HttpContext context) => {
        try
        {
            using (var dbContext = new DbContext(sourceDir))
            {
                var entry = await dbContext.GetImageEntryAsync(imageId);
                if(entry == null)
                {
                    return Results.NotFound();
                }

                var fullPath = Path.Combine(sourceDir, entry.FullFileName);
                var lastModified = DateTimeOffset.Parse(entry.Modified);

                bool isVideo = ImageProcessor.SupportedVideos.Contains(entry.Extension.ToLower());
                if(isVideo)
                {
                    // Handle video streaming
                    var fileInfo = new FileInfo(fullPath);
                    var response = context.Response;
                    response.Headers.Append("Content-Type", "video/mp4");
                    response.Headers.Append("Content-Length", fileInfo.Length.ToString());
                    response.Headers.Append("Accept-Ranges", "bytes");

                    using var stream = File.OpenRead(fullPath);
                    await stream.CopyToAsync(response.Body);
                    return Results.Empty;
                }

                if(entry.Extension.ToLower() == "gif")
                {
                    return Results.File(Path.Combine(sourceDir, entry.FullFileName), "image/gif", lastModified: DateTimeOffset.Parse(entry.Modified));                
                }
                else if(entry.Extension.ToLower() == "webp")
                {
                    return Results.File(Path.Combine(sourceDir, entry.FullFileName), "image/webp", lastModified: DateTimeOffset.Parse(entry.Modified));
                }
                else
                {
                    return Results.InternalServerError($"Unsupported extension '{entry.Extension}'");
                }
            }         
        }
        catch(Exception ex)
        {
            Console.WriteLine($"Exception thrown invoking GET /api/images/:imageId: ({ex.GetType()}) {ex.Message}");
            Console.WriteLine(ex.ToString());
            return Results.InternalServerError($"Exception thrown invoking GET /api/images/:imageId: ({ex.GetType()}) {ex.Message}");
        }
    });

    app.MapPut("/api/images/{imageId}/pin", async(Guid imageId) => {
        try
        {
            var entry = await processor.PinImage(imageId);
            if(entry == null)
            {
                return Results.NotFound();
            }
            return Results.Json(entry);
        }
        catch(Exception ex)
        {
            Console.WriteLine($"Exception thrown invoking PUT /api/images/:imageId/pin: ({ex.GetType()}) {ex.Message}");
            Console.WriteLine(ex.ToString());
            return Results.InternalServerError($"Exception thrown invoking PUT /api/images/:imageId/pin: ({ex.GetType()}) {ex.Message}");
        }

    });

    //app.delete("/api/images/:imageId", async (req, res) => {
    app.MapDelete("/api/images/{imageId}", async (Guid imageId) => {
        try
        {
            if(!await processor.DeleteImage(imageId))
            {
                return Results.NotFound();
            }
            return Results.NoContent();
        }
        catch(Exception ex)
        {
            Console.WriteLine($"Exception thrown invoking DELETE /api/images/:imageId: ({ex.GetType()}) {ex.Message}");
            Console.WriteLine(ex.ToString());
            return Results.InternalServerError($"Exception thrown invoking DELETE /api/images/:imageId: ({ex.GetType()}) {ex.Message}");
        }
    });

    app.Run();
}
catch(Exception ex)
{
    Console.WriteLine(ex);
}