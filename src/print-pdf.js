import { PDFDocument, StandardFonts, rgb, degrees } from 'pdf-lib';
export async function createPrintPdf(bytes, pages, options = {}) {
 const source = await PDFDocument.load(bytes), out = await PDFDocument.create();
 const font = await out.embedFont(StandardFonts.Helvetica), bold = await out.embedFont(StandardFonts.HelveticaBold);
 const stamp = String(options.stamp ?? '5').trim();
 if (!/^\d{1,6}$/.test(stamp)) throw new Error('Oznaka mora biti številka od 1 do 6 mest.');
 if(!Array.isArray(pages)||!pages.length||pages.some(n=>!Number.isInteger(n)||n<1||n>source.getPageCount()))throw new Error('Napačen izbor strani.');
 const start=options.start ?? 1;if(!Number.isInteger(start)||start<1||start>999999)throw new Error('Napačna začetna številka strani.');
 for (let i=0;i<pages.length;i++) {
  const original = source.getPage(pages[i]-1), crop=original.getCropBox();
  const embedded = await out.embedPage(original,{left:crop.x,bottom:crop.y,right:crop.x+crop.width,top:crop.y+crop.height});
  const rotation = ((original.getRotation().angle%360)+360)%360;
  const swapped = rotation===90 || rotation===270;
  const width=swapped?crop.height:crop.width,height=swapped?crop.width:crop.height;
  const margin=12,bottom=28,top=42;
  const page = out.addPage([width+2*margin,height+bottom+top]);
  const positions={0:[margin,bottom],90:[margin,bottom+crop.width],180:[margin+crop.width,bottom+crop.height],270:[margin+crop.height,bottom]};
  const [x,y]=positions[rotation]||positions[0];
  page.drawPage(embedded,{x,y,width:crop.width,height:crop.height,rotate:degrees(-rotation)});
  const labelWidth=Math.max(32,bold.widthOfTextAtSize(stamp,23)+16);
  page.drawRectangle({x:page.getWidth()-margin-labelWidth,y:page.getHeight()-top+7,width:labelWidth,height:29,borderColor:rgb(0,0,0),borderWidth:1,color:rgb(1,1,1)});
  page.drawText(stamp,{x:page.getWidth()-margin-labelWidth+(labelWidth-bold.widthOfTextAtSize(stamp,23))/2,y:page.getHeight()-top+12,size:23,font:bold});
  const label=`Stran ${start+i} / ${start+pages.length-1}`;
  page.drawText(label,{x:(page.getWidth()-font.widthOfTextAtSize(label,10))/2,y:10,size:10,font});
  const originalLabel=`Izvorna stran ${pages[i]}`;
  page.drawText(originalLabel,{x:margin,y:10,size:8,font,color:rgb(.4,.4,.4)});
 }
 return out.save();
}
