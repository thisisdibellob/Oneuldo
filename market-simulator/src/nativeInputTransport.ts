/** Mechanical native input adapter. Never chooses a product, route or alternative action. */
const directionKeys: Record<string,string> = { Up:'w', Down:'s', Left:'a', Right:'d' };
const supported = new Set(['Up','Down','Left','Right','w','a','s','d','Return','Escape','Tab','space']);
export function marketNativeKey(selectedKey: string): string {
  if(!supported.has(selectedKey)) throw new Error('UNSUPPORTED_ACTOR_KEY');
  // MarketMap binds both sets to the same vectors. Preserve the chosen direction/duration.
  return directionKeys[selectedKey] ?? selectedKey;
}
function label(line: string) { return line.replace(/^\s*\d+\s+/,'').replace(/, Value:.*$/,'').trim(); }
export function resolveNativeTarget(observedAX: string, freshAX: string, selectedIndex: number): number {
  if(!Number.isSafeInteger(selectedIndex) || selectedIndex<0) throw new Error('INVALID_ACTOR_TARGET');
  const original=observedAX.split('\n').find(line=>new RegExp('^\\s*'+selectedIndex+'\\s+').test(line));
  if(!original)throw new Error('ACTOR_TARGET_NOT_IN_OBSERVATION');
  const matches=freshAX.split('\n').filter(line=>/^\s*\d+\s+/.test(line) && label(line)===label(original));
  if(matches.length!==1)throw new Error('SELECTED_LITERAL_UI_ELEMENT_MISSING_OR_AMBIGUOUS');
  return Number(matches[0].match(/^\s*(\d+)/)![1]);
}
