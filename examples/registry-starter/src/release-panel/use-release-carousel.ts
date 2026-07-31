import { useState } from "react";

export function useReleaseCarousel(initialSlide = 0) {
  const [activeSlide, setActiveSlide] = useState(initialSlide);

  return {
    activeSlide,
    onSlideChange: setActiveSlide,
  };
}
