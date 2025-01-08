using System.Data;
using Dapper;
using Microsoft.Data.Sqlite;

namespace ImageScanner;


public class DbContext : IDisposable
{
    private readonly SqliteConnection _connection;

    public DbContext(string path, bool writable = false)
    {
        string databaseName = "images.db";
        var sqliteConnection = new SqliteConnection("Data Source=" + Path.Combine(path,databaseName));
        sqliteConnection.Open();

        _connection = sqliteConnection;
    }

    public void Dispose()
    {
        _connection.Close();
    }

    public async Task MigrateAsync()
    {                
        using (var transaction = _connection.BeginTransaction(IsolationLevel.Serializable, deferred: true))
        {
            await _connection.ExecuteAsync(
                @$"CREATE TABLE IF NOT EXISTS {nameof(ImageEntry)}
                (
                    {nameof(ImageEntry.Id)}             TEXT not null primary key ,
                    {nameof(ImageEntry.FullFileName)}   TEXT not null,
                    {nameof(ImageEntry.Path)}           TEXT not null,
                    {nameof(ImageEntry.Name)}           TEXT not null,
                    {nameof(ImageEntry.Extension)}      TEXT not null,
                    {nameof(ImageEntry.Tags)}           TEXT not null,
                    {nameof(ImageEntry.Hash)}           TEXT not null,
                    {nameof(ImageEntry.Metadata)}       TEXT not null,
                    {nameof(ImageEntry.Modified)}       TEXT not null,
                    {nameof(ImageEntry.LastSeen)}       TEXT not null
                ) WITHOUT ROWID");
        
            await _connection.ExecuteAsync(@$"CREATE INDEX IF NOT EXISTS {nameof(ImageEntry)}_{nameof(ImageEntry.Hash)} ON {nameof(ImageEntry)} ({nameof(ImageEntry.Hash)})");
            await _connection.ExecuteAsync(@$"CREATE UNIQUE INDEX IF NOT EXISTS {nameof(ImageEntry)}_{nameof(ImageEntry.FullFileName)} ON {nameof(ImageEntry)} ({nameof(ImageEntry.FullFileName)})");
            await _connection.ExecuteAsync(@$"CREATE INDEX IF NOT EXISTS {nameof(ImageEntry)}_{nameof(ImageEntry.LastSeen)} ON {nameof(ImageEntry)} ({nameof(ImageEntry.LastSeen)})");

            await _connection.ExecuteAsync(
                @$"CREATE TABLE IF NOT EXISTS {nameof(ImagePreview)}
                (
                    {nameof(ImagePreview.Hash)}         TEXT not null primary key,
                    {nameof(ImagePreview.Preview)}      BLOB not null,
                    {nameof(ImagePreview.Size)}         INTEGER not null,
                    {nameof(ImagePreview.Extension)}    TEXT not null
                ) WITHOUT ROWID");
                
            await transaction.CommitAsync();
        }

    }

    public async Task<ImagePreview?> GetImageEntryPreviewAsync(Guid imageId)
    {
        return await _connection.QueryFirstOrDefaultAsync<ImagePreview>(@$" SELECT p.*
            FROM {nameof(ImagePreview)} p 
            JOIN {nameof(ImageEntry)} e ON p.{nameof(ImagePreview.Hash)}=e.{nameof(ImageEntry.Hash)} 
            WHERE e.{nameof(ImageEntry.Id)} LIKE @Id",
            new {
                Id=imageId.ToString()
            });
    }

    public async Task<ImageEntry?> GetImageEntryAsync(Guid imageId)
    {
        return await _connection.QueryFirstOrDefaultAsync<ImageEntry>(@$" SELECT e.*
        FROM {nameof(ImageEntry)} e
        WHERE {nameof(ImageEntry.Id)}=@Id",
            new {
                Id=imageId.ToString()
            });
    }

    public async Task<ImageEntry?> GetImageEntryAsync(string relativeFilename)
    {
        return await _connection.QueryFirstOrDefaultAsync<ImageEntry>(@$" SELECT e.*
        FROM {nameof(ImageEntry)} e
        WHERE {nameof(ImageEntry.FullFileName)}=@FullFileName",
            new {
                FullFileName=relativeFilename
            });
    }

    public async Task<IEnumerable<ImageEntry>> GetImageEntriesAsync(int? start, int? take)
    {
        if(start == null || take == null || take == 0)
        {
            return await _connection.QueryAsync<ImageEntry>(@$" SELECT e.*
                FROM {nameof(ImageEntry)} e
                ORDER BY {nameof(ImageEntry.Id)}");
        }

        return await _connection.QueryAsync<ImageEntry>(@$" SELECT e.*
            FROM {nameof(ImageEntry)} e
            ORDER BY {nameof(ImageEntry.Id)}
            LIMIT @Take OFFSET @Start",
            new {
                Start = start,
                Take = take
            });
    }

    public async Task UpdateLastSeenAsync(string id)
    {
        await _connection.ExecuteAsync(@$"UPDATE {nameof(ImageEntry)} 
            SET {nameof(ImageEntry.LastSeen)}=@Now
            WHERE Id=@Id",
            new {
                Id = id,
                Now = DateTimeOffset.UtcNow.ToString("o")
            });
    }

    public async Task ClearUnseen(DateTimeOffset timestamp)
    {
        var count = await _connection.ExecuteAsync(@$"DELETE FROM {nameof(ImageEntry)} 
            WHERE {nameof(ImageEntry.LastSeen)}<@Now",
            new {
                Now = timestamp.ToString("o")
            });

        Console.WriteLine($"{count} entries removed after the last scan.");
            
        count = await _connection.ExecuteAsync(@$"
            DELETE FROM {nameof(ImagePreview)}
            WHERE {nameof(ImagePreview.Hash)} NOT IN (
                SELECT distinct {nameof(ImageEntry.Hash)} FROM {nameof(ImageEntry)}
            ) ");
        Console.WriteLine($"{count} previews removed after the last scan.");
    }

    public async Task<ImagePreview?> GetImagePreviewAsync(string hash)
    {
        return await _connection.QueryFirstOrDefaultAsync<ImagePreview>(@$" SELECT p.*
        FROM {nameof(ImagePreview)} p
        WHERE {nameof(ImagePreview.Hash)}=@Hash",
            new {
                Hash=hash
            });
    }

    public async Task CreateImagePreviewAsync(ImagePreview preview)
    {

        await _connection.ExecuteAsync(@$"INSERT INTO {nameof(ImagePreview)}
            (
                {nameof(ImagePreview.Hash)},
                {nameof(ImagePreview.Preview)},
                {nameof(ImagePreview.Size)},
                {nameof(ImagePreview.Extension)}
            )
            VALUES
            (
                @{nameof(ImagePreview.Hash)},
                @{nameof(ImagePreview.Preview)},
                @{nameof(ImagePreview.Size)},
                @{nameof(ImagePreview.Extension)}
            )", preview);
    }

    public async Task CreateImageEntryAsync(ImageEntry entry)
    {
        await _connection.ExecuteAsync(@$"INSERT INTO {nameof(ImageEntry)}
            (
                {nameof(ImageEntry.Id)},
                {nameof(ImageEntry.FullFileName)},
                {nameof(ImageEntry.Path)},
                {nameof(ImageEntry.Name)},
                {nameof(ImageEntry.Extension)},
                {nameof(ImageEntry.Tags)},
                {nameof(ImageEntry.Hash)} ,
                {nameof(ImageEntry.Metadata)},
                {nameof(ImageEntry.Modified)},
                {nameof(ImageEntry.LastSeen)}
            )
            VALUES
            (
                @{nameof(ImageEntry.Id)},
                @{nameof(ImageEntry.FullFileName)},
                @{nameof(ImageEntry.Path)},
                @{nameof(ImageEntry.Name)},
                @{nameof(ImageEntry.Extension)},
                @{nameof(ImageEntry.Tags)},
                @{nameof(ImageEntry.Hash)} ,
                @{nameof(ImageEntry.Metadata)},
                @{nameof(ImageEntry.Modified)},
                @{nameof(ImageEntry.LastSeen)}
            )", entry);
    }

    public async Task RemoveEntry(Guid imageId, string hash)
    {
        var count = await _connection.ExecuteAsync(@$"
            DELETE FROM {nameof(ImageEntry)}
            WHERE {nameof(ImageEntry.Id)}=@Id",
            new {
                Id = imageId
            });

        Console.WriteLine($"{count} entries deleted fpr {imageId}.");
        
        count = await _connection.ExecuteAsync(@$"
            DELETE FROM {nameof(ImagePreview)}
            WHERE {nameof(ImagePreview.Hash)}=@Hash
            AND {nameof(ImagePreview.Hash)} NOT IN (
                SELECT distinct {nameof(ImageEntry.Hash)} FROM {nameof(ImageEntry)}
            ) ",
            new {
               Hash = hash
            });
        Console.WriteLine($"{count} previews deleted.");
    }

    public async Task UpdateImageEntry(ImageEntry entry)
    {
        await _connection.ExecuteAsync(@$"UPDATE {nameof(ImageEntry)}
            SET 
                {nameof(ImageEntry.FullFileName)} = @{nameof(ImageEntry.FullFileName)},
                {nameof(ImageEntry.Path)} = @{nameof(ImageEntry.Path)},
                {nameof(ImageEntry.Modified)} = @{nameof(ImageEntry.Modified)}
            WHERE {nameof(ImageEntry.Id)} = @{nameof(ImageEntry.Id)}",
            new {
                entry.Id,
                entry.FullFileName,
                entry.Path,
                Modified = DateTimeOffset.UtcNow.ToString("o")
            });
    }
}

