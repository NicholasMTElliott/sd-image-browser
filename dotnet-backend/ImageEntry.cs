
namespace ImageScanner;

public record class ImageEntry(
    string Id, 
    string FullFileName, 
    string Path, 
    string Name, 
    string Extension, 
    string Tags, 
    string Hash, 
    string Metadata,

    string Modified, 
    string LastSeen);

public record class ImagePreview(
    string Hash,
    byte[] Preview,
    Int64 Size,
    string Extension
);