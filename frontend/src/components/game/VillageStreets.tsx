import { Image, StyleSheet, View } from 'react-native';
import { villageBuildingArt, villageDecorationArt, villageSurfaceArt } from '../../game/gameAssets';
import { extendVillageBlock, VILLAGE_CROSSINGS, VILLAGE_ROAD_DASHES, VILLAGE_SCENERY_MARGIN, VILLAGE_SIDEWALK_WIDTH, VILLAGE_STREET_BLOCKS, type VillageCrossing } from '../../game/villageStreets';

// These are scenery only, outside the playable collision bounds. Reuse the town's
// illustrations so its surroundings continue the same perspective and palette.
const edgeTrees = [
  ...[-470, -250, 30, 670, 970, 1270, 1500, 1990, 2250, 2500].map((x, i) => ({ x, y: -150 - i % 3 * 55 })),
  ...[120, 400, 940, 1260, 1530].map((y, i) => ({ x: -190 - i % 2 * 100, y })),
  ...[120, 440, 980, 1270, 1580].map((y, i) => ({ x: 2240 + i % 2 * 85, y })),
  ...[-130, 150, 440, 720, 1050, 1390, 2010, 2350].map((x, i) => ({ x, y: 1740 + i % 3 * 65 })),
];
const distantHomes = [
  {x:-410,y:-300,kind:'player-home'}, {x:40,y:-340,kind:'minsu-home'},
  {x:750,y:-360,kind:'player-home'}, {x:1280,y:-290,kind:'community'},
  {x:1960,y:-350,kind:'minsu-home'}, {x:2400,y:100,kind:'player-home'},
  {x:-470,y:1010,kind:'community'}, {x:2450,y:1160,kind:'minsu-home'},
  {x:300,y:1960,kind:'player-home'}, {x:1200,y:1990,kind:'minsu-home'},
];
const continuingDashes = [
  ...Array.from({length:13},(_,i)=>({x:450,y:-96-i*116,width:4,height:48})),
  ...Array.from({length:13},(_,i)=>({x:1800,y:-96-i*116,width:4,height:48})),
  ...Array.from({length:13},(_,i)=>({x:1800,y:1752+i*116,width:4,height:48})),
  ...Array.from({length:13},(_,i)=>({x:-80-i*116,y:768,width:48,height:4})),
  ...Array.from({length:13},(_,i)=>({x:2216+i*116,y:768,width:48,height:4})),
];

function VillageSurroundings() {
  return <View pointerEvents="none" style={styles.fill} testID="village-surroundings">
    {continuingDashes.map((d,i)=><View key={`dash-${i}`} style={[styles.dash,{left:d.x,top:d.y,width:d.width,height:d.height}]}/>)}
    {distantHomes.map((home,i)=><Image key={`home-${i}`} source={villageBuildingArt[home.kind]} resizeMode="contain" fadeDuration={0}
      style={{position:'absolute',left:home.x,top:home.y,width:238,height:225,opacity:0.3,tintColor:'#81917C'}}/>)}
    {edgeTrees.map((tree,i)=><Image key={`tree-${i}`} source={villageDecorationArt.tree} resizeMode="contain" fadeDuration={0}
      style={{position:'absolute',left:tree.x,top:tree.y,width:140+i%3*12,height:158+i%3*14,opacity:i%3===0?0.72:0.88,transform:[{scaleX:i%2?-1:1}]}}/>)}
  </View>;
}

function TactilePad({ x, y, width, height }: {x: number; y: number; width: number; height: number}) {
  const horizontal = width > height;
  return <View style={[styles.tactile, {left:x,top:y,width,height,flexDirection:horizontal?'row':'column'}]}>
    {Array.from({length:horizontal?9:7},(_,i)=><View key={i} style={{gap:3,flexDirection:horizontal?'column':'row'}}><View style={styles.dot}/><View style={styles.dot}/></View>)}
  </View>;
}

function Crossing({crossing:c}:{crossing:VillageCrossing}) {
  const vertical=c.direction==='across-main';
  return <>
    <View testID={`village-crossing-${c.id}`} style={[styles.crossing,{left:c.x,top:c.y,width:c.width,height:c.height,flexDirection:vertical?'column':'row'}]}>
      {Array.from({length:vertical?8:7},(_,i)=><View key={i} style={[styles.stripe,vertical?{height:12,width:'100%'}:{width:12,height:'100%'}]}/>)}
    </View>
    {vertical?<>
      <TactilePad x={c.x} y={c.y-28} width={c.width} height={13}/>
      <TactilePad x={c.x} y={c.y+c.height+15} width={c.width} height={13}/>
      <View style={[styles.stopLine,{left:c.x+c.width+18,top:c.y+3,width:3,height:c.height/2-15}]}/>
      <View style={[styles.stopLine,{left:c.x-21,top:c.y+c.height/2+12,width:3,height:c.height/2-15}]}/>
    </>:<>
      <TactilePad x={c.x-28} y={c.y} width={13} height={c.height}/>
      <TactilePad x={c.x+c.width+15} y={c.y} width={13} height={c.height}/>
    </>}
  </>;
}

export function VillageStreets() {
  return <View pointerEvents="none" style={styles.fill} testID="village-streets">
    <View testID="village-extended-ground" style={styles.extendedAsphalt}/>
    {Array.from({length:6},(_,row)=>Array.from({length:7},(_,col)=><Image key={`${row}-${col}`} source={villageSurfaceArt.road} resizeMode="stretch" fadeDuration={0} style={{position:'absolute',left:col*320,top:row*320,width:320,height:320,opacity:0.075}}/>))}
    {VILLAGE_STREET_BLOCKS.map(extendVillageBlock).map(b=><View key={b.id} testID={`village-block-${b.id}`} style={[styles.block,{left:b.x,top:b.y,width:b.width,height:b.height,borderTopLeftRadius:b.corners[0],borderTopRightRadius:b.corners[1],borderBottomRightRadius:b.corners[2],borderBottomLeftRadius:b.corners[3]}]}>
      <View style={styles.blockInterior}/>
    </View>)}
    {VILLAGE_ROAD_DASHES.map((d,i)=><View key={i} style={[styles.dash,{left:d.x,top:d.y,width:d.width,height:d.height}]}/>)}
    {VILLAGE_CROSSINGS.map(c=><Crossing key={c.id} crossing={c}/>)}
    <VillageSurroundings/>
  </View>;
}

const styles=StyleSheet.create({
 fill:{...StyleSheet.absoluteFill},
 extendedAsphalt:{position:'absolute',left:-VILLAGE_SCENERY_MARGIN,top:-VILLAGE_SCENERY_MARGIN,width:2200+VILLAGE_SCENERY_MARGIN*2,height:1700+VILLAGE_SCENERY_MARGIN*2,backgroundColor:'#A9AAA1'},
 block:{position:'absolute',backgroundColor:'#EDE6D8',borderColor:'#C7C1B1',borderWidth:3,overflow:'hidden'},
 blockInterior:{position:'absolute',left:VILLAGE_SIDEWALK_WIDTH,right:VILLAGE_SIDEWALK_WIDTH,top:VILLAGE_SIDEWALK_WIDTH,bottom:VILLAGE_SIDEWALK_WIDTH,borderRadius:22,backgroundColor:'#E3DFD0',borderWidth:1,borderColor:'#DCD5C4'},
 crossing:{position:'absolute',justifyContent:'space-between'},
 stripe:{backgroundColor:'#F7F3E7',borderRadius:2},
 dash:{position:'absolute',backgroundColor:'#EFE9CF',borderRadius:2},
 stopLine:{position:'absolute',backgroundColor:'#F7F3E7',borderRadius:1},
 tactile:{position:'absolute',backgroundColor:'#CEB86F',borderRadius:2,alignItems:'center',justifyContent:'space-around',padding:2},
 dot:{width:2,height:2,borderRadius:1,backgroundColor:'#A58F56'},
});
