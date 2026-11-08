// Merge into OFFICE_COMMAND_ARGUMENTS before the existing office.command schema is built.
const object=(properties,required)=>({type:'object',properties,required,additionalProperties:false});
const slide={type:'integer',minimum:1,maximum:200};
const shapeId={type:'string',minLength:1,maxLength:100};
const coordinate={type:'number',minimum:-100000000,maximum:100000000};
const extent={type:'number',minimum:1,maximum:100000000};
const geometry={x:coordinate,y:coordinate,width:extent,height:extent};
const text={type:'string',maxLength:20000};
export const PPT_COMMAND_ARGUMENTS={
 'slide.add':object({slide},['slide']),
 'slide.duplicate':object({slide},['slide']),
 'slide.delete':object({slide},['slide']),
 'slide.move':object({slide,to:slide},['slide','to']),
 'shape.addText':object({slide,text,...geometry},['slide','text']),
 'shape.text':object({slide,shapeId,expectedText:text,text},['slide','shapeId','expectedText','text']),
 'shape.geometry':object({slide,shapeId,...geometry,expectedGeometry:object(geometry,Object.keys(geometry))},['slide','shapeId','expectedGeometry']),
 'shape.format':object({slide,shapeId,fontSize:{type:'number',minimum:6,maximum:96},fontFace:{type:'string',minLength:1,maxLength:80},bold:{type:'boolean'},italic:{type:'boolean'},underline:{type:'boolean'},color:{type:'string',pattern:'^#[0-9a-fA-F]{6}$'},align:{enum:['l','ctr','r','just']}},['slide','shapeId']),
 'shape.delete':object({slide,shapeId},['slide','shapeId']),
 'ppt.image.insert':object({slide,...geometry,data:{type:'string',maxLength:1800000,pattern:'^data:image/(png|jpeg);base64,'}},['slide','data'])
};
