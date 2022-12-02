import express from 'express';
import fs from 'fs/promises';
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

app.get( "/api/images/:imageId", async (req, res) => {
    try{
        const idx = imageLookup[req.params.imageId];
        console.error(`Found id ${req.params.imageId} to ${idx}`);
        const image = foundImages[idx];
        console.log(`Mapped ${req.params.imageId} to ${idx} which worked out to ${image.id} ${image.fullFileName}`);
        const buffer = await sharp(image.fullFileName)
            .png()
            .toBuffer();
        res.header('content-type', 'image/png');
        res.send(buffer);
    }
    catch(err)
    {
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
        console.error(`Will delete ${req.params.imageId} at ${image.path}/${image.name}`);
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
        await fs.copyFile(`${image.fullFileName}`, `${sourceDir}/_pinned/_${image.name}.${image.id}.${image.extension}`);
        try{
            await fs.copyFile(`${image.path}/${image.name}.txt`, `${sourceDir}/_pinned/_${image.name}.${image.id}.txt`);
        }catch(err){}
    }
    catch(err)
    {
        res.statusCode = 500;
        res.end();
        console.error(err);
        res.statusCode = 204;
        res.end();
    }
});

// start the Express server
app.listen( port, () => {
    console.log( `server started at http://localhost:${ port }` );
} );

inventoryImages();


