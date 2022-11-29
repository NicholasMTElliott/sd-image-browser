import { Dirent } from 'fs';
import fs from 'fs/promises';
import { processFile } from './processFile';
import { reindex } from './reindex';
import { status, sourceDir } from './index';
import { uniq } from 'lodash';

export const inventoryImages = async () => {
    status.current = 'processing';
    try {
        const dir = await fs.opendir(sourceDir);
        for await (const dirent of dir) {
            await iterateDirectory(dirent, sourceDir);
        }
        reindex();
        status.current = 'done';
        console.error("Registering for changes");
        try {
            const watcher = fs.watch(sourceDir, { persistent: false, recursive: true });
            let pendingChanges: string[] = [];
            let timerId: NodeJS.Timeout | undefined = undefined;
            for await (const event of watcher) {
                try{
                    const stats = await fs.stat(sourceDir + '/' + event.filename);
                    console.log(event, stats);
                    if(stats.isFile())
                    {
                        pendingChanges.push(sourceDir + "/" + event.filename.replace(/\\/g, '/'));
                    }
                }
                catch(err) { console.error(err); }
                if(pendingChanges.length > 0 && timerId === undefined)
                {
                    timerId = setTimeout(() => {
                        timerId = undefined;
                        const changes = uniq(pendingChanges);
                        pendingChanges = [];

                        console.log(changes);
                        // parse the filename now
                        for(const change in changes)
                        {
                            const parts = change.split('/');
                            const filename = parts[parts.length-1];
                            const path = parts.slice(0, parts.length-1).join('/');
                            processFile(filename, path);
                        }
                    }, 500);
                }
            }
        } catch (err) {
            if ((err as any).name === 'AbortError')
                return;

            throw err;
        }
    }
    catch (err) {
        status.current = 'error: ' + String(err);
        console.error(err);
    }
};
const iterateDirectory = async (dirent: Dirent, path: string) => {
    if (dirent.isDirectory()) {
        console.log(`Scanning ${dirent.name} and ${path}`);
        console.log(dirent.name);
        if (dirent.name[0] != '.') {
            const subpath = path + '/' + dirent.name;
            const dir = await fs.opendir(subpath);
            for await (const subdir of dir) {
                await iterateDirectory(subdir, subpath);
            }
        }
    }
    else if (dirent.isFile()) {
        await processFile(dirent.name, path);
    }
};
