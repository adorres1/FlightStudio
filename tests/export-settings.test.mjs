import { test } from "node:test";
import assert from "node:assert/strict";
import { exportSettings, pixelSize } from "../lib/export-settings.mjs";
test("4K export dimensions support landscape, portrait and square with valid frame rates", () => {
  assert.deepEqual(pixelSize("16:9",2160),{width:3840,height:2160});
  assert.deepEqual(pixelSize("9:16",2160),{width:2160,height:3840});
  assert.deepEqual(pixelSize("1:1",2160),{width:2160,height:2160});
  const options=exportSettings({size:2160,fps:60,quality:"high",audio:true,format:"mp4"});
  assert.equal(options.fps,60);
  for (const invalid of [{size:8192},{fps:240},{quality:"__proto__"}]) assert.throws(()=>exportSettings(invalid));
});
