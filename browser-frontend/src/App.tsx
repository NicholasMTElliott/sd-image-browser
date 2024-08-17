/* eslint-disable no-plusplus */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { shuffle, uniq } from 'lodash';
import { ImageThumbnail } from "./ImageThumbnail";
import { ISDImage } from "./ISDImage";

export default function App() {
  const [images, setImages] = useState<ISDImage[]>([]);
  const [sortBy, setSortBy] = useState<'name'|'mtime'>('name');
  const [direction, setDirection] = useState<'up'|'down'>('up');
  const [status, setStatus] = useState<string>('Unknown');

  const [loading, setLoading] = useState(0);
  const startLoading = useCallback(() => setLoading((prev) => prev + 1), []);
  const endLoading = useCallback(() => setLoading((prev) => prev - 1), []);
  const isLoading = loading > 0;

  const [selectedImage, setSelectedImage] = useState<number>();
  const [viewingImage, setViewingImage] = useState<string>();

  const fetchData = useFetchData(setImages, setStatus, startLoading, endLoading);

  // on mount, fetch
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const [prefix, setPrefix] = useState('');
  const prefixes = useMemo(() => {
    const prefixlist = images.reduce((collection, img) => {
      const parts = img.path.split('/');
      for(let i = 0; i < parts.length; i += 1)
      {
        if(collection.length <= i)
        {
          collection.push([parts[i]]);
        }
        else
        {
          collection[i].push(parts[i]);
        }
      }
      return collection;
    }, [] as string[][]);
    
    let prefix = '';
    let splits: string[] = [];
    for(let i = 0; i < prefixlist.length; i += 1)
    {
      const items = uniq(prefixlist[i]);
      if(items.length === 1)
      {
        prefix += `${items[0]}/`;
      }
      else
      {
        splits = items;
        break;
      }
    }
    return splits.map(s => prefix + s).sort();
  }, [images]);
  const filteredImages = useFilteredAndSortedImages(sortBy, images, direction, prefix);

  const { onPrev, onNext, onRandom } = useOnNavigation(selectedImage, filteredImages, setSelectedImage, viewingImage, setViewingImage);

  
  const onPin = useCallback(async () => {
    if(selectedImage === undefined)
    {
      return;
    }
    const {id} = filteredImages[selectedImage];

    // pre-strip out this item
    const response = await fetch(`/api/images/${id}/pin`, { method: 'put' });
    const image = await response.json();
    setImages((imgs) => imgs.map(i => i.id === id ? image : i));
    setViewingImage(undefined);
    setTimeout( () => setViewingImage(filteredImages[selectedImage+1]?.id), 1);
  }, [filteredImages, selectedImage, setImages]);

  const deleteSequenceCount = useRef(1);
  const onDelete = useCallback(async () => {
    if(selectedImage === undefined)
    {
      return;
    }

    const sequence = deleteSequenceCount.current+1;
    deleteSequenceCount.current = sequence;

    const {id} = filteredImages[selectedImage];

    // pre-strip out this item
    setViewingImage(undefined);
    setImages(images.filter(img => img.id !== id));
    // Update filtered images or we will show something different than what is selected!
    setTimeout( () => setViewingImage(filteredImages[selectedImage+1]?.id), 1);
    await fetch(`/api/images/${id}`, { method: 'delete' });
  }, [filteredImages, images, selectedImage]);

  const onRescan = useCallback(() => {
    fetch('/api/images', { method: 'post' });
  }, []);

  useEffect(() => {
    const id = setInterval(() => onRescan(), 1000*60*3);
    return () => clearInterval(id);
  }, [onRescan]);

  useKeyboardHandlers(onPrev, onNext, onRandom, onDelete, selectedImage, setViewingImage, filteredImages, onPin, viewingImage);

  const onSelect = useCallback((imageId: string) => {
    const imageIndex = filteredImages.findIndex(img => img.id === imageId);
    setSelectedImage(imageIndex);
    setViewingImage(imageId);
  }, [filteredImages]);

  const viewingImageRef = useMemo(() => images.find(i => i.id === viewingImage), [images, viewingImage]);

  const sortByName = useCallback(() => {
    if(sortBy === 'name')
    {
      if(direction === 'up')
      {
        setDirection('down');
      }
      else
      {
        setDirection('up');
      }
    }
    else
    {
      setSortBy('name');
      setDirection('up');
    }
  }, [direction, sortBy]);

  const sortByDate = useCallback(() => {
    if(sortBy === 'mtime')
    {
      if(direction === 'up')
      {
        setDirection('down');
      }
      else
      {
        setDirection('up');
      }
    }
    else
    {
      setSortBy('mtime');
      setDirection('up');
    }
  }, [direction, sortBy]);

  const onCopy = useCallback(() => {
    if(!viewingImageRef)
    {
      return;
    }

    navigator.clipboard?.writeText(viewingImageRef.metadata);
    console.log(viewingImageRef.metadata);
    alert(viewingImageRef.metadata);
  }, [viewingImageRef]);

  return <div id='browser-page'>
    <div id='tabs'>
      {
        prefixes.map(p => <button type="button" onClick={() => setPrefix(p)}>{p}</button>)        
      }
    </div>
    <div id='browser'>
      <div id='toolbar'>
        <div>{isLoading ? 'Refreshing...' : status}</div>
        <button type='button' onClick={onRandom}>Random</button>
        <button type="button" onClick={fetchData}>Refresh</button>
        <button type="button" onClick={sortByName}>Name {sortBy === 'name' && direction}</button>
        <button type="button" onClick={sortByDate}>Date {sortBy === 'mtime' && direction}</button>
        <button type='button' onClick={onDelete}>Delete</button>
        <button type="button" onClick={onRescan}>Rescan</button>
      </div>
      {
        filteredImages.map((image, idx) => (
          <ImageThumbnail 
            key={`${image.name}.${image.id}`}  
            image={image} 
            onSelect={onSelect}
            isSelected={selectedImage === idx} />
        ))
      }
    </div>
    <div id='view-container' className={viewingImage && 'visible'}>
      <div id='view-tools-top'>
        <button type='button' title={viewingImageRef?.metadata} onClick={onCopy}>c</button>
      </div>
      <img 
        id='view-image' 
        src={viewingImage ? `/api/images/${viewingImage}` : 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEAAAAALAAAAAABAAEAAAI=;'} 
        style={{ 
          backgroundImage: `url("/api/thumbnails/${viewingImageRef?.id}")`
        } } 
        title={viewingImageRef?.name}/>
        <div id='view-tools-bottom'>
          <button type='button' onClick={onDelete}>-</button>
          <button type='button' onClick={onPrev}>{'<'}</button>
          <button type='button' onClick={onRandom}>{'!'}</button>
          <button type='button' onClick={onNext}>{'>'}</button>
          <button type='button' onClick={onPin}>+</button>
          <button id='close-view-container-button' type='button' onClick={() => setViewingImage(undefined)}>X</button>
        </div>
    </div>
  </div>;
}

function useKeyboardHandlers(onPrev: () => void, onNext: () => void, onRandom: () => void, onDelete: () => Promise<void>, selectedImage: number | undefined, setViewingImage: (v:string | undefined) => any, filteredImages: ISDImage[], onPin: () => Promise<void>, viewingImage: string | undefined) {
  useEffect(() => {
    const handleKeys = (event: any) => {
      if (event.keyCode === 37) {
        onPrev();
        event.preventDefault();
      }
      else if (event.keyCode === 39) {
        onNext();
        event.preventDefault();
      }
      else if (event.keyCode === 39) {
        onNext();
        event.preventDefault();
      }
      else if (event.keyCode === 68) {
        onDelete();
        event.preventDefault();
      }
      else if (event.keyCode === 32 && selectedImage !== undefined) {
        setViewingImage(filteredImages[selectedImage].id);
        event.preventDefault();
      }
      else if (event.keyCode === 80 && selectedImage !== undefined) {
        onPin();
        event.preventDefault();
      }
      else if (event.keyCode === 27) {
        setViewingImage(undefined);
      }
      else if (event.keyCode===82 ) {
        onRandom();
        event.preventDefault();
      }
      else {
        console.error(`Other key: keyCode ${event.keyCode} key ${event.key}`, event.keyCode, event.key);
      }
    };

    window.addEventListener('keydown', handleKeys);

    return () => {
      window.removeEventListener('keydown', handleKeys);
    };
  }, [onNext, onPrev, onDelete, viewingImage, selectedImage, filteredImages, onPin, setViewingImage]);
}

function useOnNavigation(selectedImage: number | undefined, filteredImages: ISDImage[], setSelectedImage: (v:number) => any, viewingImage: string | undefined, setViewingImage: (v:string|undefined) => any) {
  const updateViewingImage = useCallback((id: string) => {
    setViewingImage(undefined);
    
    if(id != undefined)
    {
      setTimeout( () => setViewingImage(id), 1);
    }
  }, [setViewingImage]);

  const onNext = useCallback(() => {
    if (selectedImage === undefined)
      return;

    const index = selectedImage;
    console.error(`Current index is ${index}`);
    const nextIndex = (index + 1) % filteredImages.length;
    console.error(`Next index is ${nextIndex}`);
    const nextImage = filteredImages[nextIndex].id;
    console.error(`Next image is ${nextImage}`);
    setSelectedImage(nextIndex);
    updateViewingImage(nextImage);
  }, [selectedImage, filteredImages, setSelectedImage, viewingImage, updateViewingImage]);


  const onPrev = useCallback(() => {
    if (selectedImage === undefined)
      return;

    const index = selectedImage;
    const prevIndex = index === 0 ? filteredImages.length - 1 : index - 1;
    const prevImage = filteredImages[prevIndex].id;
    setSelectedImage(prevIndex);
    updateViewingImage(prevImage);
  }, [selectedImage, filteredImages, setSelectedImage, viewingImage, updateViewingImage]);


  const randomOrderList = useMemo(() => {
    return shuffle(filteredImages.map(i => i.id));
  }, [filteredImages])

  const onRandom = useCallback(() => {
    const currentIndex = viewingImage ? randomOrderList.indexOf(viewingImage) : -1;
    const nextIndex = (currentIndex+1) % randomOrderList.length;
    const nextImage = randomOrderList[nextIndex];
    const nextRealIndex = filteredImages.findIndex(i => i.id === nextImage);
    setSelectedImage(nextRealIndex);
    updateViewingImage(nextImage);
  }, [randomOrderList, filteredImages.length, setSelectedImage, updateViewingImage, viewingImage]);

  return { onPrev, onNext, onRandom };
}

function useFilteredAndSortedImages(sortBy: string, images: ISDImage[], direction: string, prefix: string) {
  const filteredImages = useMemo(() => images.filter(image => (image.path.indexOf(prefix) === 0)), [images, prefix]);
  
  const sortedImages = useMemo(() => {
    let sorted;
    if (sortBy === 'name') {
      // eslint-disable-next-line no-nested-ternary
      sorted = filteredImages.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
    }

    else {

      // eslint-disable-next-line no-nested-ternary
      sorted = filteredImages.sort((a, b) => a.modified < b.modified ? -1 : a.modified > b.modified ? 1 : 0);
    }
    if (direction === 'down') {
      sorted = sorted.reverse();
    }

    return sorted;
  }, [filteredImages, sortBy, direction]);
  return sortedImages;
}

function useFetchData(setImages: (v: any) => any, setStatus: (v:string) => any, startLoading: () => any, endLoading: () => any) {
  const fetchSequenceCount = useRef(1);
  const fetchData = useCallback(async () => {
    startLoading();
    try
    {
      const sequence = fetchSequenceCount.current + 1;
      fetchSequenceCount.current = sequence;
      const imageTask = await fetch('/api/images');
      const statusTask = await fetch('/api/status');

      const images = await imageTask.json();
      const status = await statusTask.json();

      if (sequence === fetchSequenceCount.current) {
        setImages(images);
        setStatus(status)
      }
    }
    finally
    {
      endLoading();
    }
  }, [endLoading, setImages, setStatus, startLoading]);
  return fetchData;
}

