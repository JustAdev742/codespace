// Preview only. Does in the browser what the owner would do once in Square's editor, so the mirrored
// site shows the redesign: the homepage's embed blocks give way to text blocks holding component
// markers, and /find-your-bike/ becomes the finder page. Not part of the site-wide script.
(() => {
  const textBlock = marker => {
    const block = document.createElement('div');
    block.className = 'w-block cb-preview-block';
    const p = document.createElement('p');
    p.textContent = marker;
    block.append(p);
    return block;
  };
  const replaceContent = (blocks, markers) => {
    if (!blocks.length) return;
    blocks[0].before(...markers.map(textBlock));
    blocks.forEach(b => b.remove());
  };
  // The page's own content blocks: everything but the header, the slide-outs and the footer.
  // The shared site footer is an embed block too; it stays.
  const isFooter = b => /<footer[\s>]/i.test(b.querySelector('iframe')?.getAttribute('srcdoc') ?? '');
  const content = () => [...document.querySelectorAll('.w-block')]
    .filter(b => !b.closest('.w-block-header, .nav-mobile, .slideout-cart-container, .slideout__content')
      && !b.matches('.w-block-header, .w-background-dark') && !isFooter(b));

  if (location.pathname === '/' || location.pathname === '/index.html') {
    replaceContent(content(), ['[[hero bike=IQNARFJR5KK42SAYKPCXBQDD image=9 image-fit=cover image-position="50% 75%"]]',
      '[[ride-types]]', '[[bike-row heading="On sale now"]]', '[[visit]]']);
  } else if (location.pathname.startsWith('/find-your-bike')) {
    document.title = 'Find your e-bike | Cyberbikes';
    replaceContent(content(), ['[[bike-finder sync-url]]']);
  }
})();
