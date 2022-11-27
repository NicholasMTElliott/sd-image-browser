import { useCallback } from "react";
import { ISDImage } from "./ISDImage";

export function ImageThumbnail(props: { setSelectedImage: any; image: ISDImage; setViewingImage: any; selectedImage: string | undefined; }) {
  const { setSelectedImage, image, setViewingImage, selectedImage } = props;
  const onClick = useCallback(() => {
    setSelectedImage(image.id);
    setViewingImage(image.id);
  },
    [setSelectedImage, setViewingImage, image.id]);
  return <button
    type="button"
    onClick={onClick}
    className={`image-container ${selectedImage === image.id && 'selected'}`}
    key={image.id}>
    <img className='image-preview' alt={image.name} src={image.preview} />
  </button>;
}
