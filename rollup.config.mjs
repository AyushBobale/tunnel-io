import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import typescript from "@rollup/plugin-typescript";
import terser from "@rollup/plugin-terser";

export default {
  input: "dist/src/index.js", // Your entry point
  output: {
    file: "dist/bundle.js",
    format: "umd", // Universal Module Definition, works as amd, cjs and iife all in one
    name: "TunnelIO", // The global variable name representing your library
  },
  plugins: [
    resolve(), // Helps Rollup find modules in node_modules
    commonjs(), // Converts CommonJS modules to ES6
    // typescript(), // Converts TypeScript to JavaScript
    // terser(), // Minifies the bundle
  ],
};
