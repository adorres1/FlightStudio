import { test } from 'node:test';
import assert from 'node:assert/strict';
import { placeCallout } from '../public/tutorial-layout.mjs';

test('tutorial callouts stay inside the window at every screen edge', () => {
  for (const viewport of [{width:1280,height:720},{width:800,height:560},{width:360,height:500}]) {
    const card={width:Math.min(370,viewport.width-24),height:330};
    for (const [left,top] of [[0,0],[viewport.width-80,0],[0,viewport.height-40],[viewport.width-80,viewport.height-40]]) {
      const result=placeCallout({left,top,right:left+80,bottom:top+40},card,viewport);
      assert.ok(result.x>=0&&result.y>=0);
      assert.ok(result.x+card.width<=viewport.width);
      assert.ok(result.y+card.height<=viewport.height);
      if(result.arrow) for(const point of [result.arrow.start,result.arrow.end]) assert.ok(Number.isFinite(point.x)&&Number.isFinite(point.y));
    }
  }
});
test('tutorial callout avoids obscuring a control when space is available', () => {
  const target={left:20,top:150,right:200,bottom:210};
  const card={width:370,height:300};
  const result=placeCallout(target,card,{width:1280,height:720});
  assert.ok(result.x>=target.right||result.x+card.width<=target.left||result.y>=target.bottom||result.y+card.height<=target.top);
  assert.ok(result.arrow);
});
test('missing or offscreen targets do not prevent the user continuing or closing', () => {
  const missing=placeCallout(null,{width:370,height:300},{width:800,height:600});
  assert.deepEqual(missing,{x:215,y:150,arrow:null});
  const offscreen=placeCallout({left:-800,top:100,right:-600,bottom:150},{width:370,height:300},{width:800,height:600});
  assert.ok(offscreen.x>=0&&offscreen.y>=0);
  assert.ok(offscreen.x+370<=800&&offscreen.y+300<=600);
});
