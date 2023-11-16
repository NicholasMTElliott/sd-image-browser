import express from 'express';
import fs from 'fs/promises';
import { createReadStream }  from 'fs';
import sharp from 'sharp';
import { inventoryImages } from './inventoryImages';
import { reindex } from './reindex';

interface ISDImage
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

export const foundImages: ISDImage[] = [];
export let imageTagLookup: { [key: string]: number[] } = {
    '': []
};
export let imageLookup: { [key: string]: number } = {};
export let status : { current: 'none' | 'processing' | 'done' | string } = { current: 'none' };

const app = express();
const port =  process.env.PORT || 3000; // default port to listen
export const sourceDir = process.env.IMAGES_ROOT_DIR || './samples';
export const supportedImages = ["png", "jpg", "webp", "jpeg", "gif"];


app.get( "/api/status", ( req, res ) => {
    res.header('content-type', 'application/json');
    res.send( JSON.stringify(status.current) );
} );

app.get( "/api/images", ( req, res ) => {
    res.header('content-type', 'application/json');
    res.send( JSON.stringify(foundImages) );
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
        const idx = imageLookup[req.params.imageId];
        const image = foundImages[idx];
        console.log(`Mapped ${req.params.imageId} to ${idx} which worked out to ${image.id} ${image.fullFileName}`);
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

app.delete( "/api/images/:imageId", async (req, res) => {
    try
    {
        const idx = imageLookup[req.params.imageId];
        const image = foundImages[idx];

        // TODO delete should remove every extension matching the file part!
        console.log(`Will delete ${req.params.imageId} at ${image.path}/${image.name}`);
        await fs.rm(`${image.path}/${image.name}.${image.extension}`);
        try {
            await fs.rm(`${image.path}/${image.name}.txt`); // Ok if this failes
        }
        catch(err)
        {} 
        
        foundImages.splice(idx, 1);
        res.statusCode = 204;
        res.end();

        // reindex
        reindex();
    }
    catch(err)
    {
        res.statusCode = 500;
        res.end();
        console.error(err);
    }
});

app.put("/api/images/:imageId/pin", async (req, res) => {
    try
    {
        const idx = imageLookup[req.params.imageId];
        const image = foundImages[idx];
        await fs.mkdir(`${sourceDir}/_pinned`, { recursive: true });
        await fs.rename(image.fullFileName, `${sourceDir}/_pinned/_${image.name}.${image.id}.${image.extension}`);
        try{
            await fs.rename(`${image.path}/${image.name}.txt`, `${sourceDir}/_pinned/_${image.name}.${image.id}.txt`);
            // clean up any other files with the same prefix
            const dir = await fs.opendir(image.path);
            for await (const dirent of dir) {
                if(dirent.name.startsWith(image.name))
                {
                    console.log(`rm ${image.path}/${dirent.name}`);
                    await fs.rm(`${image.path}/${dirent.name}`);
                }
            }
        }catch(err){}
        res.statusCode = 204;
        res.end();
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

inventoryImages();


