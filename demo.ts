enum PvDimension {
  pageTitle,
  date,
  pagePath,
  yearWeek
}

enum Fuga {
  aaa,
  bbb
}

enum Hoge {
  hoge,
  fuga
}

console.log(PvDimension.pagePath); // 1
console.log(PvDimension[PvDimension.pagePath]); // pagePath

const toStringKeys = (e: any) => {
  return Object.keys(e).filter(v => isNaN(Number(v))===false).map(k => e[k])
}
console.log(toStringKeys(PvDimension));
const mergedEnum = {
  ...Hoge,
  ...Fuga
}

console.log(mergedEnum);

type Unpacked<T> = T extends { [K in keyof T]: infer U } ? U : never;

const foo = ['aaa', 'bbb'] as const;
const bar = ['ccc', 'ddd'] as const;

type Foo = Unpacked<typeof foo>;
type Bar = Unpacked<typeof bar>;
type FooBar = Foo | Bar;
type FromIndex<T> = {T: number}

type AA = 'aaa'|'bbb';
type BB = {[P in AA]: number};

// const h1: BB = {aaa: 3, bbb: 2};
// const h2: BB = {aaa: 'a'};
// const h3: BB = {ccc: 2};
//
// const a1: AA[] = ['aaa'];
// const a2: AA[] = ['ccc'];
//
console.log('=======================');

const toEnum = (keys: FooBar[]) => {
  return keys.reduce((acc, cur: FooBar, i: number) => {
    acc[i] = cur;
    // acc['aaa'] = 1;
    // acc['aaab'] = 1;
    acc[cur] = i;
    return acc;
  // }, {} as {[Pick<T, Exclude<keyof T, K>>]: number});
    }, {} as {[key in FooBar]: number} & {[key: number]: FooBar});
}
// 個数分の数値キーと文字列キーのみをキーとしたハッシュ

// const fooEnum = toEnum<FooBar>([...foo, ...bar]);
const fooEnum = toEnum([...foo, ...bar]);
console.log(fooEnum);

console.log('-------------------');

//
// Enumライクなキーマッピングできるようにする
// 関数を追加する
// Symbol
// Map
// Set
//
//
