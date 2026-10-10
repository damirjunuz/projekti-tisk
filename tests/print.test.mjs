import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PDFDocument,degrees,rgb,StandardFonts} from 'pdf-lib';
import {createPrintPdf} from '../src/print-pdf.js';
import {writeFile,mkdir} from 'node:fs/promises';
test('Stamps selected pages with margins and preserves rotation and crop',async()=>{
 const source=await PDFDocument.create();const font=await source.embedFont(StandardFonts.Helvetica);
 for(const rotation of [0,90,180,270]){const p=source.addPage([300,400]);p.drawRectangle({x:30,y:40,width:240,height:320,borderColor:rgb(0,0,0),borderWidth:2});p.drawText('TOP LEFT - drawing '+rotation,{x:35,y:340,size:12,font});p.drawText('BOTTOM RIGHT',{x:155,y:55,size:12,font});p.setCropBox(30,40,240,320);p.setRotation(degrees(rotation));}
 const input=await source.save();const bytes=await createPrintPdf(input,[1,2,3,4],{stamp:'5',start:1});const out=await PDFDocument.load(bytes);assert.equal(out.getPageCount(),4);
 assert.equal(out.getPage(0).getWidth(),264);assert.equal(out.getPage(1).getWidth(),344);assert.equal(out.getPage(1).getHeight(),310);
 const original=await PDFDocument.load(input);assert.equal(original.getPage(1).getRotation().angle,90);assert.equal(original.getPage(0).getHeight(),400);
 await assert.rejects(createPrintPdf(input,[5]));await assert.rejects(createPrintPdf(input,[1],{stamp:'abc'}));await assert.rejects(createPrintPdf(input,[1],{start:0}));
 if(process.env.PDF_TEST_OUTPUT){await mkdir(process.env.PDF_TEST_OUTPUT,{recursive:true});await writeFile(process.env.PDF_TEST_OUTPUT+'/stamp-test.pdf',bytes);}
});
