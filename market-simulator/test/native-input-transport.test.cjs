require('../runtime.cjs');
const { test }=require('node:test');
const assert=require('node:assert/strict');
const {marketNativeKey,resolveNativeTarget}=require('../src/nativeInputTransport.ts');
test('same selected product survives quantity feedback and refreshed AX numbering',()=>{
  const old='91 버튼 해뜰 특란 15구 6,900원 담기\n92 버튼 해뜰 특란 10구 5,200원 담기';
  const fresh='101 버튼 해뜰 특란 10구 5,200원 담기\n102 버튼 해뜰 특란 15구 6,900원 담기\n103 텍스트 현재 담은 수량 1개';
  assert.equal(resolveNativeTarget(old,fresh,91),102);
  assert.throws(()=>resolveNativeTarget(old,'101 버튼 해뜰 특란 10구 5,200원 담기',91),/MISSING_OR_AMBIGUOUS/);
  assert.throws(()=>resolveNativeTarget(old,fresh+'\n104 버튼 해뜰 특란 15구 6,900원 담기',91),/MISSING_OR_AMBIGUOUS/);
});
test('native key transport preserves requested market direction and never invents a key',()=>{
  const vectors={Up:[0,-1],Down:[0,1],Left:[-1,0],Right:[1,0],w:[0,-1],s:[0,1],a:[-1,0],d:[1,0]};
  for(const k of Object.keys(vectors))assert.deepEqual(vectors[k],vectors[marketNativeKey(k)]);
  assert.equal(marketNativeKey('Return'),'Return');
  assert.throws(()=>marketNativeKey('super+l'),/UNSUPPORTED_ACTOR_KEY/);
});
