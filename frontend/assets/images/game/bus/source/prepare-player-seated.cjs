const fs = require('node:fs');
const path = require('node:path');
const sharp = require(process.env.BUS_ART_SHARP_MODULE || 'sharp');
const root = path.resolve(__dirname, '..');
async function main() {
 const source = path.join(__dirname, 'player-seated.png');
 const before = await sharp(source).metadata();
 if (!before.hasAlpha) throw new Error('Expected generated transparency');
 const {data,info} = await sharp(source).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 let left=info.width,top=info.height,right=-1,bottom=-1;
 for(let y=0;y<info.height;y++) for(let x=0;x<info.width;x++) if(data[(y*info.width+x)*4+3]>8) {left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);}
 left=Math.max(0,left-4);top=Math.max(0,top-4);right=Math.min(info.width-1,right+4);bottom=Math.min(info.height-1,bottom+4);
 const crop={left,top,width:right-left+1,height:bottom-top+1};
 const output=path.join(root,'player-seated.png');
 await sharp(source).extract(crop).resize({height:340,withoutEnlargement:true}).png({compressionLevel:9,adaptiveFiltering:true}).toFile(output);
 const after=await sharp(output).metadata();
 const item={name:'player-seated',source:'source/player-seated.png',sourceWidth:before.width,sourceHeight:before.height,crop,width:after.width,height:after.height,bytes:fs.statSync(output).size,hasAlpha:after.hasAlpha,builtInOriginal:'exec-22a88d4b-e329-4f45-89e4-40e314f20850.png'};
 const manifestPath=path.join(root,'asset-manifest.json');
 const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8')).filter(entry=>entry.name!=='player-seated');
 fs.writeFileSync(manifestPath,JSON.stringify([...manifest,item],null,2)+'\n');
 await sharp(output).flatten({background:'#F2EADB'}).png().toFile(path.join(__dirname,'qa-player-seated.png'));
 console.log(JSON.stringify(item));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
