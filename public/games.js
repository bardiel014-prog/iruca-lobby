export const GAMES=Object.freeze([
 {id:'chinchiro-fixed',name:'チンチロ（親固定）',description:'ホストが親。全員の出目を精算して1ゲーム。',dealer:'host'},
 {id:'chinchiro-rotation',name:'チンチロ（親回り）',description:'親と順番を抽選。全員が親を務めて1ゲーム。',dealer:'rotation'},
 {id:'chinchiro-cheat',name:'チンチロ（親固定・イカサマあり）',description:'配信者が親。親はシゴロ賽を使える。子はいつでもイカサマを指摘できる。',dealer:'host',cheat:true},
 {id:'kotoba',name:'ことばならべ',description:'数字は言わずに、お題に沿った言葉だけで小さい順に並べる協力ゲーム。',dealer:'host',kind:'kotoba'},
 {id:'highlow',name:'ハイ＆ロー',description:'配信者がカードをめくり、リスナー全員が次のカードに賭ける。',dealer:'host',kind:'highlow'},
]);
// Rooms created before the selector keep their original rotation rules.
export const gameDefinition=id=>GAMES.find(game=>game.id===id)||GAMES[1];
