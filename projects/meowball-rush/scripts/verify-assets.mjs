// Node scene checks construct geometry without decoding or rendering images.
// Match the bundler's image-module shape while retaining each source asset URL.
import { registerHooks } from 'node:module';
registerHooks({
  load(url, context, nextLoad) {
    if (/\.(?:webp|png|jpe?g)$/.test(url)) return {
      format: 'module', source: `export default ${JSON.stringify(url)};`, shortCircuit: true,
    };
    return nextLoad(url, context);
  },
});
