// The playground imports the library straight from ../src: resolve `three`
// from the playground's node_modules so there is a single Three.js instance.
export default {
  resolve: { dedupe: ['three'] },
};
