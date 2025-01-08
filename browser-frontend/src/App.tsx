/* eslint-disable no-plusplus */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { shuffle, uniq } from 'lodash';
import { ImageThumbnail } from "./ImageThumbnail";
import { ISDImage } from "./ISDImage";
import { useHistory, useLocation } from "react-router-dom";

export default function App() {
  const history = useHistory();
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);

  const [images, setImages] = useState<ISDImage[]>([]);
  const [sortBy, setSortBy] = useState<'name'|'mtime'>(queryParams.get('sortBy') as 'name'|'mtime' || 'name');
  const [direction, setDirection] = useState<'up'|'down'>(queryParams.get('direction') as 'up'|'down' || 'up');
  const [status, setStatus] = useState<string>('Loading...');
  const [loading, setLoading] = useState(0);
  const startLoading = useCallback(() => setLoading((prev) => prev + 1), []);
  const endLoading = useCallback(() => setLoading((prev) => prev - 1), []);
  const isLoading = loading > 0;
  const [selectedImage, setSelectedImage] = useState<number>();
  const [viewingImage, setViewingImage] = useState<string|undefined>(queryParams.get('viewingImage') || '');
  const [prefix, setPrefix] = useState(queryParams.get('prefix') || '');

  const fetchData = useFetchData(setImages, setStatus, startLoading, endLoading);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (prefix) params.set('prefix', prefix);
    if (viewingImage) params.set('viewingImage', viewingImage);
    if (sortBy) params.set('sortBy', sortBy);
    if (direction) params.set('direction', direction);
    history.push('/?' + params.toString());
  }, [prefix, viewingImage, sortBy, direction, history]);

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

    try {
      const {id} = filteredImages[selectedImage];
      console.log(`Deleting image ${id}`);

      setViewingImage(undefined);
      setImages(images.filter(img => img.id !== id));
      
      const response = await fetch(`/api/images/${id}`, { method: 'delete' });
      if (!response.ok) {
        throw new Error(`Delete failed: ${response.statusText}`);
      }
      
      setTimeout(() => setViewingImage(filteredImages[selectedImage+1]?.id), 1);
    } catch (err) {
      console.error('Error deleting image:', err);
      setStatus('Error deleting image');
    }
  }, [filteredImages, images, selectedImage, setImages]);

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

/**
 * Handles keyboard navigation and shortcuts
 */
function useKeyboardHandlers(onPrev: () => void, onNext: () => void, onRandom: () => void, onDelete: () => Promise<void>, selectedImage: number | undefined, setViewingImage: (v:string | undefined) => void, filteredImages: ISDImage[], onPin: () => Promise<void>, viewingImage: string | undefined) {
  useEffect(() => {
    const handleKeys = (event: KeyboardEvent) => {
      console.log(`Key pressed: ${event.key} (${event.keyCode})`);
      
      switch(event.keyCode) {
        case 37: // Left arrow
          onPrev();
          break;
        case 39: // Right arrow
          onNext();
          break;
        case 68: // 'D' key
          onDelete();
          break;
        case 32: // Space
          if(selectedImage !== undefined) {
            setViewingImage(filteredImages[selectedImage].id);
          }
          break;
        case 80: // 'P' key
          if(selectedImage !== undefined) {
            onPin();
          }
          break;
        case 27: // Escape
          setViewingImage(undefined);
          break;
        case 82: // 'R' key
          onRandom();
          break;
        default:
          return;
      }
      event.preventDefault();
    };

    window.addEventListener('keydown', handleKeys);
    return () => window.removeEventListener('keydown', handleKeys);
  }, [onNext, onPrev, onDelete, viewingImage, selectedImage, filteredImages, onPin, setViewingImage]);
}

/**
 * Navigation helper functions
 */
function useOnNavigation(selectedImage: number | undefined, filteredImages: ISDImage[], setSelectedImage: (v:number) => void, viewingImage: string | undefined, setViewingImage: (v:string|undefined) => void) {
  const updateViewingImage = useCallback((id: string) => {
    setViewingImage(undefined);
    
    if(id != undefined)
    {
      setTimeout( () => setViewingImage(id), 1);
    }
  }, [setViewingImage]);

  const onNext = useCallback(() => {
    if (selectedImage === undefined || filteredImages.length === 0) {
      console.log('Cannot navigate: no selection or empty list');
      return;
    }

    const nextIndex = (selectedImage + 1) % filteredImages.length;
    console.log(`Navigating to next image: ${nextIndex}`);
    setSelectedImage(nextIndex);
    updateViewingImage(filteredImages[nextIndex].id);
  }, [selectedImage, filteredImages, setSelectedImage, updateViewingImage]);

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

/**
 * Fetches images and status from the API with error handling and sequence tracking
 */
function useFetchData(setImages: (v: ISDImage[]) => void, setStatus: (v:string) => void, startLoading: () => void, endLoading: () => void) {
  const fetchSequenceCount = useRef(1);
  
  const fetchData = useCallback(async () => {
    startLoading();
    console.log('Fetching image data...');
    
    try {
      const sequence = fetchSequenceCount.current + 1;
      fetchSequenceCount.current = sequence;
      
      const [imageResponse, statusResponse] = await Promise.all([
        fetch('/api/images'),
        fetch('/api/status')
      ]);

      if (!imageResponse.ok) {
        throw new Error(`Failed to fetch images: ${imageResponse.statusText}`);
      }
      if (!statusResponse.ok) {
        throw new Error(`Failed to fetch status: ${statusResponse.statusText}`);
      }

      const images = await imageResponse.json();
      const status = await statusResponse.json();

      if (sequence === fetchSequenceCount.current) {
        console.log(`Loaded ${images.length} images`);
        setImages(images);
        setStatus(status)
      }
    } catch (err) {
      console.error('Error fetching data:', err);
      setStatus('Error loading data');
    } finally {
      endLoading();
    }
  }, [endLoading, setImages, setStatus, startLoading]);
  
  return fetchData;
}

