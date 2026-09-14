if (process.env.WDS_GALLERY_RELEASE !== '1') {
  console.error([
    'BLOCKED: direct Firebase Hosting deploys can remove the four designs.',
    'Use: node design-gallery/release.mjs --publish',
    'The legacy command bash scripts/deploy.sh is also safe.'
  ].join('\n'));
  process.exit(1);
}

console.log('Four-design gallery release guard passed.');
