// Ver809: approved US Letter statement layout for double-window envelopes.
// Dedicated to account statements; other report and invoice headers stay separate.
const navy='0.055 0.145 0.235';
const slate='0.320 0.380 0.440';
const red='0.780 0.110 0.160';
const companyName='WOOTEN OIL CO INC.';
// Helvetica-Bold width from the standard PDF font metrics, in points at size 1.
const companyNameWidth=10.501;
const companyNameSize=Number((176/companyNameWidth).toFixed(4));
const escape=value=>String(value).replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)');
const text=(x,y,size,value,bold=false,color=navy)=>
  `BT /${bold?'F2':'F1'} ${size} Tf 100 Tz ${color} rg ${x} ${y} Td (${escape(value)}) Tj ET`;

function roundedPath(x,y,w,h,r){
  const k=r*0.55228475;
  return `${x+r} ${y} m ${x+w-r} ${y} l ${x+w-r+k} ${y} ${x+w} ${y+r-k} ${x+w} ${y+r} c ${x+w} ${y+h-r} l ${x+w} ${y+h-r+k} ${x+w-r+k} ${y+h} ${x+w-r} ${y+h} c ${x+r} ${y+h} l ${x+r-k} ${y+h} ${x} ${y+h-r+k} ${x} ${y+h-r} c ${x} ${y+r} l ${x} ${y+r-k} ${x+r-k} ${y} ${x+r} ${y} c h`;
}

export function statementMailingLetterhead(){
  return [
    'q',
    `${red} rg ${roundedPath(42,724,34,34,8)} f`,
    text(44.363,735,17,'WO',true,'1 1 1'),
    text(86,737,companyNameSize,companyName,true),
    text(42,710,9.5,'513 East Sanford Avenue, Covington, TN 38019',false,slate),
    text(42,695,9.5,'(901) 476-2684 | support@wootenoil.com',false,slate),
    text(476.672,757,8,'CUSTOMER ACCOUNTS',true,red),
    text(502,738,17,'Account',true),
    text(487.822,719,17,'Statement',true),
    `0.9 w ${navy} RG 42 680 m 570 680 l S`,
    'Q'
  ].join('\n');
}

export function statementFoldMarks(){
  // The upper pair follows the approved guide; no demonstration boxes or red marks.
  return ['q 0.533 0.584 0.631 RG 0.4 w',
    ...[537,264].flatMap(y=>[`18 ${y} m 24 ${y} l S`,`588 ${y} m 594 ${y} l S`]),
    'Q'].join('\n');
}
