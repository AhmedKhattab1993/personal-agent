import { graphql } from './client.js';

/**
 * Smoke test: hit a minimal GraphQL field that only needs basic auth, to prove
 * the access token works before we worry about the (changing) jobs schema.
 *
 * Usage:  node src/me.js
 */
const ME_QUERY = /* GraphQL */ `
  query Me {
    currentUser {
      id
      niid
      status
    }
  }
`;

async function main() {
  try {
    const data = await graphql(ME_QUERY);
    console.log('✅ Authenticated. Current user:');
    console.log(JSON.stringify(data?.currentUser, null, 2));
  } catch (e) {
    console.error('✗', e.message);
    process.exit(1);
  }
}

main();
