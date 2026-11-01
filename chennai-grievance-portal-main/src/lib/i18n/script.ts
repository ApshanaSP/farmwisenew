/** The site's language before the first paint (layout.tsx); kept apart from lang.ts, which has React hooks. */
export const LANG_SCRIPT =
  "try{if(localStorage.getItem('diq-lang')==='ta'){document.documentElement.lang='ta';document.documentElement.dataset.lang='ta'}}catch(e){}";
