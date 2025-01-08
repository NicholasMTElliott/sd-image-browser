import { useCallback } from "react";

/**
 * Displays a selectable tag with a checkbox
 */
export function SelectableTag(props: { tagName: string; selectedTags: Record<string, boolean>; setSelectedTags: (tags: (prev:Record<string, boolean>) => Record<string, boolean> ) => void; }) {
  const { tagName, setSelectedTags } = props;

  const onClick = useCallback(() => {
    setSelectedTags((prevTags) => ({ ...prevTags, [tagName]: !prevTags[tagName] }));
  }, [tagName, setSelectedTags]);

  return <label key={tagName} htmlFor={tagName}>
    <input id={tagName} key={tagName} type="checkbox" onClick={onClick} />
    {tagName || '[None]'}
  </label>;
}
