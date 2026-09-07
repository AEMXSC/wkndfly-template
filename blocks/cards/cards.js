import { createOptimizedPicture } from '../../scripts/aem.js';
import { moveInstrumentation } from '../../scripts/scripts.js';

export default function decorate(block) {
  // Read layout from the first card row (field index 5)
  const firstRow = block.children[0];
  const layoutDiv = firstRow?.children[5];
  const layout = layoutDiv?.querySelector('p')?.textContent?.trim()
    || layoutDiv?.textContent?.trim() || 'default';
  if (layout !== 'default') {
    block.classList.add(layout);
  }

  const ul = document.createElement('ul');
  [...block.children].forEach((row) => {
    const li = document.createElement('li');

    // Fields: 0=image, 1=text, 2=ctalabel, 3=ctalink, 4=ctastyle, 5=layout, 6=style, 7=imgstyle
    const ctaLabelDiv = row.children[2];
    const ctaLabel = ctaLabelDiv?.querySelector('p')?.textContent?.trim()
      || ctaLabelDiv?.textContent?.trim() || '';

    const ctaLinkDiv = row.children[3];
    const ctaLinkAnchor = ctaLinkDiv?.querySelector('a');
    const ctaLink = ctaLinkAnchor?.getAttribute('href')
      || ctaLinkDiv?.querySelector('p')?.textContent?.trim()
      || ctaLinkDiv?.textContent?.trim() || '';

    const ctaStyleDiv = row.children[4];
    const ctaStyle = ctaStyleDiv?.querySelector('p')?.textContent?.trim()
      || ctaStyleDiv?.textContent?.trim() || 'button';

    const styleDiv = row.children[6];
    const style = styleDiv?.querySelector('p')?.textContent?.trim()
      || styleDiv?.textContent?.trim() || '';

    const imageStyleDiv = row.children[7];
    const imageStyle = imageStyleDiv?.querySelector('p')?.textContent?.trim()
      || imageStyleDiv?.textContent?.trim() || '';

    if (style) {
      li.classList.add(style);
    }

    moveInstrumentation(row, li);
    while (row.firstElementChild) li.append(row.firstElementChild);

    // Process the li children
    let imageDiv = null;
    [...li.children].forEach((div, index) => {
      if (index === 0) {
        div.className = 'cards-card-image';
        imageDiv = div;
      } else if (index === 1) {
        div.className = 'cards-card-body';
      } else {
        // Hide config divs (ctalabel, ctalink, ctastyle, layout, style, imagestyle)
        div.className = 'cards-config';
        div.style.display = 'none';
      }
    });

    if (imageStyle && imageDiv) {
      imageDiv.classList.add(imageStyle);
    }

    // Render CTA button from label + link fields
    if (ctaLabel && ctaLink) {
      const bodyDiv = li.querySelector('.cards-card-body');
      if (bodyDiv) {
        const ctaContainer = document.createElement('p');
        ctaContainer.className = `button-container cta-${ctaStyle}`;
        const anchor = document.createElement('a');
        anchor.className = 'button';
        anchor.href = ctaLink;
        anchor.title = ctaLabel;
        anchor.textContent = ctaLabel;
        ctaContainer.appendChild(anchor);
        bodyDiv.appendChild(ctaContainer);
      }
    }
    
    ul.append(li);
  });
  ul.querySelectorAll('picture > img').forEach((img) => {
    const optimizedPic = createOptimizedPicture(img.src, img.alt, false, [{ width: '750' }]);
    moveInstrumentation(img, optimizedPic.querySelector('img'));
    img.closest('picture').replaceWith(optimizedPic);
  });
 
  block.textContent = '';
  block.append(ul);
}
