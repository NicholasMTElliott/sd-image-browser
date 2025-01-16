/* eslint-disable react/require-default-props */
import { memo, useCallback, useState } from 'react';
import { TransformWrapper, TransformComponent, ReactZoomPanPinchContentRef } from 'react-zoom-pan-pinch';
import { FiCopy, FiTrash2, FiChevronLeft, FiChevronRight, FiShuffle, FiMaximize, FiX, FiStar, FiEye } from 'react-icons/fi';
import { ISDImage } from './ISDImage';

interface ImageViewerProps {
  viewingImage?: string;
  viewingImageRef?: ISDImage;
  onCopy: () => void;
  onDelete: () => Promise<void>;
  onPrev: () => void;
  onRandom: () => void;
  onNext: () => void;
  onPin: () => Promise<void>;
  setViewingImage: (v: string | undefined) => void;
}

export const ImageViewer = memo(({
  viewingImage,
  viewingImageRef,
  onCopy,
  onDelete,
  onPrev,
  onRandom,
  onNext,
  onPin,
  setViewingImage
}: ImageViewerProps) => {

  const [transformComponentRef, setTransformComponentRef] = useState<ReactZoomPanPinchContentRef | null>(null);
  const [mediaRef, setMediaRef] = useState<HTMLImageElement | HTMLVideoElement | null>(null);
  const isVideo = viewingImageRef?.extension?.toLowerCase() === 'mp4';

  const zoomToExtents = useCallback(() => {
    if (!mediaRef) return;
    if (!transformComponentRef) return;

    const { zoomToElement } = transformComponentRef;
    zoomToElement(mediaRef);
  }, [mediaRef, transformComponentRef]);

  return (
    <div id='view-container'className={viewingImage && 'visible'} >
      <div id='view-tools-top'>
        <button 
          type='button' 
          title={`Copy Image Info${viewingImageRef?.metadata ? `: ${viewingImageRef.metadata}` : ''}`} 
          onClick={onCopy}
        >
          <FiCopy />
        </button>
        <button type='button' title="Pin Image" onClick={onPin}>
        <FiStar />
        </button>
        <div className='expander' />
        <button
          type='button'
          title="Open Image in New Tab"
          onClick={() => window.open(`/api/images/${viewingImage}`, '_blank')}
        >
          <FiEye />
        </button>
        <button type='button' title="Reset Zoom" onClick={zoomToExtents}>
        <FiMaximize />
        </button>
        <button id='close-view-container-button' title="Close Viewer" type='button' onClick={() => setViewingImage(undefined)}>
        <FiX />
        </button>
      </div>
      
      <TransformWrapper
        ref={setTransformComponentRef}  
        minScale={0.1}
        maxScale={8}
        centerOnInit
        doubleClick={{
          mode: "zoomIn",
        }}
        limitToBounds
      >
        {({ resetTransform, setTransform }) => (
            <TransformComponent
              wrapperClass="image-transform-wrapper"
              contentClass="image-transform-content"
            >
              {isVideo ? (
                <video
                  ref={setMediaRef as (ref: HTMLVideoElement | null) => void}
                  id='view-video'
                  controls
                  autoPlay
                  loop
                  style={{
                    backgroundImage: `url("/api/thumbnails/${viewingImageRef?.id}")`,
                    maxWidth: '100%',
                    maxHeight: '100%'
                  }}
                  title={viewingImageRef?.name}
                  onLoadedMetadata={zoomToExtents}
                >
                  <source src={viewingImage ? `/api/images/${viewingImage}` : ''} type="video/mp4" />
                  Your browser does not support the video tag.
                </video>
              ) : (
                <img 
                  ref={setMediaRef as (ref: HTMLImageElement | null) => void}
                  id='view-image' 
                  alt="Gallery Content"
                  src={viewingImage ? `/api/images/${viewingImage}` : 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEAAAAALAAAAAABAAEAAAI=;'} 
                  style={{ 
                    backgroundImage: `url("/api/thumbnails/${viewingImageRef?.id}")`
                  }} 
                  title={viewingImageRef?.name}
                  onLoad={zoomToExtents}
                />
              )}
            </TransformComponent>
        )}
      </TransformWrapper>
            
            <div id='view-tools-bottom'>
              <button type='button' title="Delete Image" onClick={onDelete}>
                <FiTrash2 />
              </button>
              <div className='expander' />
              <button type='button' title="Previous Image" onClick={onPrev}>
                <FiChevronLeft />
              </button>
              <button type='button' title="Random Image" onClick={onRandom}>
                <FiShuffle />
              </button>
              <button type='button' title="Next Image" onClick={onNext}>
                <FiChevronRight />
              </button>
            </div>
    </div>
    );
  });
