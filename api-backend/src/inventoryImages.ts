import { Dirent } from 'fs';
import fs from 'fs/promises';
import { processFile } from './processFile.js';
import { reindex } from './reindex.js';
import { status, sourceDir, imageLookup, ISDImage } from './index.js';
import lodash from 'lodash';
const { sortBy } = lodash;

export let pass = 1;

const bump = async () => new Promise(r => setTimeout(r, 1));

let singleInstance = new Promise(r => r(0));

export const inventoryImages = async () => {
    let lastSemaphore = singleInstance;
    let singleComplete = () => {};
    singleInstance = new Promise(r => singleComplete = function () {
        r(0);
    });
    await lastSemaphore;

    try
    {
        if(!Object.keys(imageLookup).length)
        {
            try{
                
                const localcache = await fs.readFile(`${sourceDir}/localcache.json`, 'utf8');
                const decoded = JSON.parse(localcache);
                for(const entry of Object.entries(decoded))
                {
                    imageLookup[entry[0]] = entry[1] as ISDImage;
                }
                console.log(`Restored ${Object.keys(imageLookup).length} from localcache`);
            }catch(err)
            {
                console.warn(err);
            }
        }
        pass++;
        status.current = 'processing';
        try {
            const dir = await fs.opendir(sourceDir);
            const subdirs: Dirent[] = [];
            for await (const dirent of dir) {
                subdirs.push(dirent);
            }

            for(const dirent of sortBy(subdirs, d => d.name))
            {
                await iterateDirectory(dirent, sourceDir);
                await bump();
            }
            
            reindex();

            for(const key in imageLookup)
            {
                if(imageLookup[key].pass !== pass)
                {
                    delete imageLookup[key];
                }
            }

            await fs.writeFile(`${sourceDir}/localcache.json`, JSON.stringify(imageLookup));

            status.current = 'done';
            /*console.log("Registering for changes");
            try {
                const watcher = fs.watch(sourceDir, { persistent: false, recursive: true });
                let pendingChanges: string[] = [];
                let timerId: NodeJS.Timeout | undefined = undefined;
                for await (const event of watcher) {
                    if(!event.filename)
                    {
                        continue;
                    }
                    
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
            }*/
        }
        catch (err) {
            status.current = 'error: ' + String(err);
            console.error(err);
        }
    }
    finally{
        singleComplete();
    }
};

const iterateDirectory = async (dirent: Dirent, path: string) => {
    if (dirent.isDirectory()) {
        console.log(`Scanning ${dirent.name} in ${path}`);
        let count = 0;
        if (dirent.name[0] != '.') {
            const subpath = path + '/' + dirent.name;
            const dir = await fs.opendir(subpath);
            const files: { [prefix:string] : { [ext: string] : Dirent} } = {};
            for await (const subdir of dir) {
                if(subdir.isDirectory())
                {
                    await iterateDirectory(subdir, subpath);
                    continue;
                }
                const name = subdir.name;
                const fileParts = name.split('.');
                const extension = fileParts[fileParts.length - 1].toLowerCase();
                const namePart = fileParts.slice(0, fileParts.length - 1).join('.');

                if(!files[namePart])
                {
                    files[namePart] = {};
                }
                if(!files[namePart][extension])
                {
                    files[namePart][extension] = subdir;
                }
                await bump();
            }

            for(const prefix in files)
            {
                let subdir: Dirent | undefined = files[prefix]['webp'] ?? files[prefix]['gif'] ?? files[prefix]['jpg'] ?? files[prefix]['png'];
                
                if(subdir)
                {
                    await iterateDirectory(subdir, subpath);
                }
                await bump();
            }
        }
    }
    else if (dirent.isFile()) {
        await processFile(dirent.name, path);
    }
};
