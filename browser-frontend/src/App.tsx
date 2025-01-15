/* eslint-disable no-plusplus */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { shuffle, uniq } from 'lodash';
import { useNavigate, useLocation } from "react-router-dom";
import { ImageThumbnail } from "./ImageThumbnail";
import { ISDImage } from "./ISDImage";
import { ImageViewer } from "./ImageViewer";

function buildUrl(prefix: string, viewingImage: string, sortBy: string, direction: string) {
  const params = new URLSearchParams();
  if (prefix) params.set('prefix', prefix);
  if (viewingImage) params.set('viewingImage', viewingImage);
  if (sortBy) params.set('sortBy', sortBy);
  if (direction) params.set('direction', direction);
  return `/?${params.toString()}`;
}

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();

  const queryParams = new URLSearchParams(location.search);

  const prefix = queryParams.get('prefix') || '';
  const viewingImage = queryParams.get('viewingImage') || '';
  const sortBy = queryParams.get('sortBy') as 'name'|'mtime' || 'name';
  const direction = queryParams.get('direction') as 'up'|'down' || 'up';

  const setPrefix = useCallback((v: string | undefined) => 
  {
    const url = buildUrl(v || '', viewingImage, sortBy, direction);
    // Only navigate if the URL has changed and isn't in our recent history
    if(url !== document.location.pathname + document.location.search)
    {
      console.log(`Navigating to ${url}`);
      navigate(url);
    }
  }, [direction, navigate, sortBy, viewingImage]);

  const setViewingImage = useCallback((v: string | undefined) => {
    const url = buildUrl(prefix, v || '', sortBy, direction);
    // Only navigate if the URL has changed and isn't in our recent history
    if(url !== document.location.pathname + document.location.search)
    {
      console.log(`Navigating to ${url}`);
      navigate(url);
    }
  }, [direction, navigate, prefix, sortBy]);

  const setSortByAndDirection = useCallback((paramSortBy: 'name'|'mtime' | undefined, paramDirection: 'up'|'down' | undefined ) => {
    const url = buildUrl(prefix, viewingImage, paramSortBy || sortBy, paramDirection || direction);
    // Only navigate if the URL has changed and isn't in our recent history
    if(url !== document.location.pathname + document.location.search)
    {
      console.log(`Navigating to ${url}`);
      navigate(url);
    }
  }, [direction, navigate, prefix, sortBy, viewingImage]);


  const [images, setImages] = useState<ISDImage[]>([]);
  const [status, setStatus] = useState<string>('Loading...');
  const [loading, setLoading] = useState(0);
  const startLoading = useCallback(() => setLoading((prev) => prev + 1), []);
  const endLoading = useCallback(() => setLoading((prev) => prev - 1), []);
  const isLoading = loading > 0;
  const urlHistory = useRef<string[]>([]);

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
    const url = `/?${params.toString()}`;
    // Only navigate if the URL has changed and isn't in our recent history
    if(url !== document.location.pathname + document.location.search && !urlHistory.current.includes(url))
    {
      console.log(`Navigating to ${url}`);
      navigate(url);
      urlHistory.current.push(url);
      // only retain the last 4 urls
      urlHistory.current = urlHistory.current.slice(-4);
    }
  }, [prefix, viewingImage, sortBy, direction, navigate]);



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
  const selectedImage = useMemo(() => filteredImages.findIndex(i => i.id === viewingImage), [filteredImages, viewingImage]);

  const { onPrev, onNext, onRandom } = useOnNavigation(selectedImage, filteredImages, viewingImage, setViewingImage);

  const onPin = useCallback(async () => {
    if(selectedImage === undefined)
    {
      console.error("Pinned but selected was not defined");
      return;
    }
    const {id} = filteredImages[selectedImage];

    const response = await fetch(`/api/images/${id}/pin`, { method: 'put' });
    const image = await response.json();
    setImages((imgs) => imgs.map(i => i.id === id ? image : i));
    setViewingImage(undefined);
    setTimeout( () => setViewingImage(filteredImages[selectedImage+1]?.id), 1);
  }, [filteredImages, selectedImage, setViewingImage]);

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
  }, [filteredImages, images, selectedImage, setViewingImage]);

  const onRescan = useCallback(() => {
    fetch('/api/images', { method: 'post' });
  }, []);

  useEffect(() => {
    const id = setInterval(() => onRescan(), 1000*60*3);
    return () => clearInterval(id);
  }, [onRescan]);

  useKeyboardHandlers(onPrev, onNext, onRandom, onDelete, selectedImage, setViewingImage, filteredImages, onPin, viewingImage);

  const onSelect = useCallback((imageId: string) => {
    setViewingImage(imageId);
  }, [setViewingImage]);

  const viewingImageRef = useMemo(() => images.find(i => i.id === viewingImage), [images, viewingImage]);

  const sortByName = useCallback(() => {
    if(sortBy === 'name')
    {
      if(direction === 'up')
      {
        setSortByAndDirection(undefined, 'down');
      }
      else
      {
        setSortByAndDirection(undefined, 'up');
      }
    }
    else
    {
      setSortByAndDirection('name','up');
    }
  }, [direction, setSortByAndDirection, sortBy]);

  const sortByDate = useCallback(() => {
    if(sortBy === 'mtime')
    {
      if(direction === 'up')
      {
        setSortByAndDirection(undefined, 'down');
      }
      else
      {
        setSortByAndDirection(undefined, 'up');
      }
    }
    else
    {
      setSortByAndDirection('mtime', 'up');
    }
  }, [direction, setSortByAndDirection, sortBy]);

  const onCopy = useCallback(() => {
    if(!viewingImageRef)
    {
      return;
    }

    navigator.clipboard?.writeText(viewingImageRef.metadata);
    console.log(viewingImageRef.metadata);
    // eslint-disable-next-line no-alert
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
    <ImageViewer 
      viewingImage={viewingImage}
      viewingImageRef={viewingImageRef}
      onCopy={onCopy}
      onDelete={onDelete}
      onPrev={onPrev}
      onRandom={onRandom} 
      onNext={onNext}
      onPin={onPin}
      setViewingImage={setViewingImage}
    />
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
  }, [onNext, onPrev, onDelete, viewingImage, selectedImage, filteredImages, onPin, setViewingImage, onRandom]);
}

/**
 * Navigation helper functions
 */
function useOnNavigation(selectedImage: number | undefined, filteredImages: ISDImage[], viewingImage: string | undefined, setViewingImage: (v:string|undefined) => void) {
  const updateViewingImage = useCallback((id: string) => {
    setViewingImage(undefined);
    
    if(id !== undefined)
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
    updateViewingImage(filteredImages[nextIndex].id);
  }, [selectedImage, filteredImages, updateViewingImage]);

  const onPrev = useCallback(() => {
    if (selectedImage === undefined)
      return;

    const index = selectedImage;
    const prevIndex = index === 0 ? filteredImages.length - 1 : index - 1;
    const prevImage = filteredImages[prevIndex].id;
    updateViewingImage(prevImage);
  }, [selectedImage, filteredImages, updateViewingImage]);


  const randomOrderList = useMemo(() => shuffle(filteredImages.map(i => i.id)), [filteredImages])

  const onRandom = useCallback(() => {
    const currentIndex = viewingImage ? randomOrderList.indexOf(viewingImage) : -1;
    const nextIndex = (currentIndex+1) % randomOrderList.length;
    const nextImage = randomOrderList[nextIndex];
    updateViewingImage(nextImage);
  }, [viewingImage, randomOrderList, updateViewingImage]);

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

