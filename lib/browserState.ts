// Keys the video list uses to hand its position back to itself. They live in
// their own module so the video page can read them without importing the list
// component along with them.

/** Where the list was scrolled to, kept per distinct view. */
export const SCROLL_KEY = "ella:list-scroll";
