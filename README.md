# pdf-editor

# To run the FieldMap Generator
node --loader ts-node/esm generateFieldMap.mjs --in=fieldMap.partial.json --out=fieldMap.ts --fontSize=12 --clearBackground=false

# To run the test example
npx ts-node example.ts