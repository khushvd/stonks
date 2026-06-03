import { extractPageText } from "../pdf/extract-text.js";

const [, , path, pageArg] = process.argv;
if (!path) {
  console.error("usage: pnpm pdf-text <path> [page]");
  process.exit(1);
}
const pages = await extractPageText(path);
const filtered = pageArg ? pages.filter((p) => p.page === Number(pageArg)) : pages;
console.log(JSON.stringify(filtered, null, 2));
