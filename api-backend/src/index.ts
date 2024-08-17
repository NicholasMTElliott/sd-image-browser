import express from 'express';
import fs from 'fs/promises';
import { createReadStream }  from 'fs';
import sharp from 'sharp';
import { inventoryImages } from './inventoryImages.js';

import sqlite3 from 'sqlite3';
const  { Database } = sqlite3;

const app = express();
const port =  process.env.PORT || 3000; // default port to listen
export const sourceDir = process.env.IMAGES_ROOT_DIR || './samples';
export const supportedImages = ["png", "jpg", "webp", "jpeg", "gif"];

const db = new Database(`${sourceDir}/localcache.db`);

export interface ISDImage
{
    id: string;
    fullFileName: string;
    path: string;
    name: string;
    extension: string;
    tags: string[];
    preview: string;
    modified: string;
    size: number;
    metadata: string;
    pass: number;
}

export let imageTagLookup: { [key: string]: string[] } = {
    '': []
};
export let imageLookup: { [key: string]: ISDImage } = {};
export let status : { current: 'none' | 'processing' | 'done' | string } = { current: 'none' };


app.get( "/api/status", ( req, res ) => {
    res.header('content-type', 'application/json');
    res.send( JSON.stringify(status.current) );
} );

app.get( "/api/images", ( req, res ) => {
    res.header('content-type', 'application/json');
    res.send( JSON.stringify(Object.values(imageLookup)) );
} );

app.post( "/api/images", ( req, res ) => {
    inventoryImages();
    res.statusCode = 204;
    res.end();
} );

app.get( "/api/tags", ( req, res ) => {
    res.header('content-type', 'application/json');
    res.send( JSON.stringify(imageTagLookup) );
} );

app.get("/api/images/:imageId", async (req, res) => {
    try{
        const image = imageLookup[req.params.imageId];
        if(!image)
        {
            res.statusCode = 404;
            res.end();
            return;
        }
        
        console.log(`Mapping ${req.params.imageId}`);
        console.log(`Mapped ${req.params.imageId} to ${image.id} ${image.fullFileName}`);
        res.header('Cache-control', 'public, max-age=86400')
        await fs.access(image.fullFileName, fs.constants.F_OK);

        if(image.extension === 'gif')
        {
            res.header('content-type', 'image/gif');
            createReadStream(image.fullFileName).pipe(res);
        }
        else if(image.extension === 'webp')
        {
            res.header('content-type', 'image/webp');
            createReadStream(image.fullFileName).pipe(res);
        }
        else
        {
            const imageSharp = await sharp(image.fullFileName)
                .webp({ quality: 80 });
            const buffer = await imageSharp.toBuffer();
            res.header('content-type', 'image/webp');
            res.send(buffer);
        }
    }
    catch(err)
    {
        console.error(err);
        res.statusCode = 500;
        res.end();
    }
});

app.delete("/api/images/:imageId", async (req, res) => {
    let responseSent = false;
    try
    {
        const image = imageLookup[req.params.imageId];
        if(!image)
        {
            res.statusCode = 404;
            res.end();
            responseSent = true;
            return;
        }
        res.statusCode = 204;
        res.end();
        responseSent = true;

        // Delete should remove every extension matching the file part!
        console.log(`Will delete ${req.params.imageId} at ${image.path}/${image.name}`);
        const dir = await fs.opendir(image.path);
        for await (const dirent of dir) {
            if(dirent.name.startsWith(`${image.name}.`))
            {
                console.log(`rm ${image.path}/${dirent.name}`);
                await fs.rm(`${image.path}/${dirent.name}`);
            }
        }
        delete imageLookup[req.params.imageId];
    }
    catch(err)
    {
        console.error(err);
        if(!responseSent)
        {
            res.statusCode = 500;
            res.end();
        }
    }
});

app.put("/api/images/:imageId/pin", async (req, res) => {
    try
    {
        const image = imageLookup[req.params.imageId];
        if(!image)
        {
            res.statusCode = 404;
            res.end();
            return;
        }
        const destinationPinnedDirectory = `${sourceDir}/_pinned`;
        const newFullFilename = `${sourceDir}/_pinned/_${image.name}.${image.id}.${image.extension}`;
        const originalPath = image.path;
        await fs.mkdir(destinationPinnedDirectory, { recursive: true });
        await fs.copyFile(image.fullFileName, newFullFilename);
        console.log(`Copied from ${image.fullFileName} to ${newFullFilename}`);
        try{
            await fs.copyFile(`${image.path}/${image.name}.txt`, `${destinationPinnedDirectory}/_${image.name}.${image.id}.txt`);
            console.log(`Copied from ${image.path}/${image.name}.txt to ${destinationPinnedDirectory}/_${image.name}.${image.id}.txt`);

        }catch(err){}
        image.fullFileName = newFullFilename;
        image.path = `${sourceDir}/_pinned`;

        res.header('content-type', 'application/json');
        res.send( JSON.stringify(image) );

        // clean up any other files with the same prefix
        const dir = await fs.opendir(originalPath);
        for await (const dirent of dir) {
            if(dirent.name.startsWith(image.name))
            {
                console.log(`will rm ${originalPath}/${dirent.name}`);
                await fs.rm(`${originalPath}/${dirent.name}`);
            }
        }

    }
    catch(err)
    {
        res.statusCode = 500;
        res.end();
        console.error(err);
    }
});

// start the Express server
app.listen( port, () => {
    console.log( `server started at http://localhost:${ port }` );
} );

function loop()
{
    inventoryImages().then(() => {
        setTimeout(() => loop(), 1000 * 60 * 10)
    });
}

loop();



// Rework:

// A DB, create at launch if it doesn't exist
// It allows us to index by an image id as well as a thumbprint
// We server information from this database
// We allow paging