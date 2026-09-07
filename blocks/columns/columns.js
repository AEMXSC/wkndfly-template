import { decorateBlock, loadBlock } from '../../scripts/aem.js';

function embedYoutube(url, autoplay, background) {
  const usp = new URLSearchParams(url.search);
  let suffix = '';
  if (background || autoplay) {
    const suffixParams = {
      autoplay: autoplay ? '1' : '0',
      mute: background ? '1' : '0',
      controls: background ? '0' : '1',
      disablekb: background ? '1' : '0',
      loop: background ? '1' : '0',
      playsinline: background ? '1' : '0',
    };
    suffix = `&${Object.entries(suffixParams).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')}`;
  }
  let vid = usp.get('v') ? encodeURIComponent(usp.get('v')) : '';
  const embed = url.pathname;
  if (url.origin.includes('youtu.be')) {
    [, vid] = url.pathname.split('/');
  }

  const temp = document.createElement('div');
  temp.innerHTML = `<div style="left: 0; width: 100%; height: 0; position: relative; padding-bottom: 56.25%;">
      <iframe src="https://www.youtube.com${vid ? `/embed/${vid}?rel=0&v=${vid}${suffix}` : embed}" style="border: 0; top: 0; left: 0; width: 100%; height: 100%; position: absolute;" 
      allow="autoplay; fullscreen; picture-in-picture; encrypted-media; accelerometer; gyroscope; picture-in-picture" allowfullscreen="" scrolling="no" title="Content from Youtube" loading="lazy"></iframe>
    </div>`;
  return temp.children.item(0);
}

function getVideoElement(source, autoplay, background) {
  const video = document.createElement('video');
  video.setAttribute('controls', '');
  if (autoplay) video.setAttribute('autoplay', '');
  if (background) {
    video.setAttribute('loop', '');
    video.setAttribute('playsinline', '');
    video.removeAttribute('controls');
    video.addEventListener('canplay', () => {
      video.muted = true;
      if (autoplay) video.play();
    });
  }

  const sourceEl = document.createElement('source');
  sourceEl.setAttribute('src', source);
  sourceEl.setAttribute('type', 'video/mp4');
  video.append(sourceEl);

  return video;
}

const loadVideoEmbed = (block, link, autoplay, background) => {
  const isYoutube = link.includes('youtube') || link.includes('youtu.be');
  if (isYoutube) {
    const url = new URL(link);
    const embedWrapper = embedYoutube(url, autoplay, background);
    block.append(embedWrapper);
    embedWrapper.querySelector('iframe').addEventListener('load', () => {
      block.dataset.embedLoaded = true;
    });
  } else {
    const videoEl = getVideoElement(link, autoplay, background);
    block.append(videoEl);
    videoEl.addEventListener('canplay', () => {
      block.dataset.embedLoaded = true;
    });
  }
};

function isVideoLink(link) {
  try {
    if (!link) return false;
    // Check for regular video files
    const regularVideoCheck = link.match(/\.(mp4|mov|wmv|avi|mkv|webm)$/i) !== null;

    // Check for YouTube URLs
    const youtubeCheck = (
      link.includes('youtube.com')
          || link.includes('youtu.be')
          || link.includes('youtube-nocookie.com')
    );

    // Combined check
    const isVideo = regularVideoCheck || youtubeCheck;

    // Log the type of video for debugging
    if (isVideo) {
      console.log('Video type:', {
        isRegularVideo: regularVideoCheck,
        isYouTube: youtubeCheck,
        url: link,
      });
    }

    return isVideo;
  } catch (error) {
    console.error('Error checking video link:', error);
    return false;
  }
}

/**
 * Load the component model registry (served at site root) once and cache it.
 * Each entry maps a model id to the Set of its field names, used to recognise a
 * key-value block that a column delivered flattened (no class/markup).
 * @returns {Promise<Array<{id:string, fields:Set<string>}>>}
 */
function loadComponentModels() {
  if (!window.hlxComponentModels) {
    window.hlxComponentModels = fetch('/component-models.json')
      .then((resp) => (resp.ok ? resp.json() : []))
      .then((models) => (Array.isArray(models) ? models : [])
        .map((m) => ({ id: m.id, fields: new Set((m.fields || []).map((f) => f.name)) })))
      .catch(() => []);
  }
  return window.hlxComponentModels;
}

/**
 * A column cell is a candidate flattened block when its only content is an even run
 * of <p> elements (key/value pairs). Normal rich-text columns contain other markup
 * (lists, headings, pictures) and are excluded.
 * @param {Element} col the column cell
 * @returns {string[]|null} the candidate keys (even-indexed <p> text), or null
 */
function flattenedKeys(col) {
  const children = [...col.children];
  if (children.length < 2 || children.length % 2 !== 0) return null;
  if (!children.every((el) => el.tagName === 'P')) return null;
  return children.filter((_, i) => i % 2 === 0).map((p) => p.textContent.trim());
}

/**
 * Preview/publish path: a key-value block (e.g. Join Us) dropped inside a column is
 * delivered flattened as <p>key</p><p>value</p> pairs, WITHOUT its block class or row
 * structure (author keeps data-aue instrumentation, so this isn't needed there).
 * Identify the block by matching the delivered keys against the model registry, then
 * rebuild the proper block DOM. Fully generic — no block name or field is hard-coded.
 * @param {Element} col the column cell
 * @param {Array<{id:string, fields:Set<string>}>} models the model registry
 * @returns {Element|null} the rebuilt block element, or null if unrecognised
 */
function rebuildFlattenedBlock(col, models) {
  const keys = flattenedKeys(col);
  if (!keys) return null;
  // the block is the model that declares every delivered key (most specific wins)
  const match = models
    .filter((m) => m.fields.size && keys.every((k) => m.fields.has(k)))
    .sort((a, b) => a.fields.size - b.fields.size)[0];
  if (!match) return null;

  const ps = [...col.children];
  const nested = document.createElement('div');
  nested.classList.add(match.id);
  for (let i = 0; i < ps.length; i += 2) {
    const rowEl = document.createElement('div');
    const keyCell = document.createElement('div');
    keyCell.textContent = ps[i].textContent.trim();
    const valCell = document.createElement('div');
    valCell.append(ps[i + 1].cloneNode(true));
    rowEl.append(keyCell, valCell);
    nested.append(rowEl);
  }
  col.replaceChildren(nested);
  return nested;
}

export default async function decorate(block) {
  const cols = [...block.firstElementChild.children];
  block.classList.add(`columns-${cols.length}-cols`);

  // Blocks (e.g. Join Us) dropped inside a column render with the block markup
  // already in place, but sit too deep for aem.js's decorateBlocks() to find them,
  // so their JS/CSS never loads. Find and load them here instead.

  const nestedBlockPromises = [];

  // Preview/publish: any column delivered as a flattened key-value block is rebuilt into
  // real block markup, identified via the model registry. No-op in author / for text cols.
  const candidateCols = [...block.querySelectorAll(':scope > div > div')].filter(flattenedKeys);
  if (candidateCols.length) {
    const models = await loadComponentModels();
    candidateCols.forEach((col) => rebuildFlattenedBlock(col, models));
  }

  // setup image columns
  [...block.children].forEach((row) => {
    row.classList.add('columns-row');
    // const firstChild = row.querySelector(':scope > div:first-child');
    [...row.children].forEach((col) => {
      // decorate any nested block authored inside a column (e.g. a custom block).
      // block name comes from the delivered wrapper's own class — nothing hard-coded.
      const nestedBlock = col.querySelector(':scope > div[class]:not([data-block-status])');
      if (nestedBlock && nestedBlock.classList.length) {
        decorateBlock(nestedBlock);
        loadBlock(nestedBlock);
      }

      const pic = col.querySelector('picture');
      if (pic) {
        const picWrapper = pic.closest('div');
        if (picWrapper && picWrapper.children.length === 1) {
          // picture is only content in column
          picWrapper.classList.add('columns-img-col');
        }
      }
      // const videoBlock = col.querySelector('div[data-aue-model="video"]');

      const linkavl = col.querySelector('a')?.href;
      const videoBlock = linkavl ? isVideoLink(linkavl) : false;

      if (videoBlock) {
        const videoWrapper = col.closest('div');
        if (videoWrapper) {
          // Add video specific classes
          videoWrapper.classList.add('columns-video-col');

          // Get video link from button container
          const videoLink = col.querySelector('a');
          if (videoLink) {
            const videoUrl = videoLink.getAttribute('href');

            // Create video container
            const videoContainer = document.createElement('div');
            videoContainer.className = 'columns-video-container';

            // Load video with appropriate embed
            loadVideoEmbed(
              videoContainer,
              videoUrl,
              col.dataset.autoplay === 'true',
              col.dataset.background === 'true',
            );

            // Replace button container with video container
            const buttonContainer = videoLink.closest('div');
            if (buttonContainer) {
              buttonContainer.replaceWith(videoContainer);
            }
          }
        }
      }

      const customClassConfig = Array.from(row.querySelectorAll('div')).find((el) => {
        if (el.children.length < 2) return false;
        const [keyCell, valueCell] = el.children;
        return keyCell.textContent.trim() === 'custom-class' && valueCell.textContent.trim() === 'block';
      });

      if (customClassConfig) {
        const componentRoot = customClassConfig.parentElement; // comment
        const componentName = componentRoot?.getAttribute('data-aue-component')
          || componentRoot?.getAttribute('data-aue-model')
          || Array.from(componentRoot?.classList || []).find((className) => className !== 'block');

        if (componentName) {
          componentRoot.classList.add('block');
          componentRoot.dataset.blockName = componentName;
          componentRoot.setAttribute('blockName', componentName);
        }
      }
    });

    block.querySelectorAll('div.block').forEach((nestedBlock) => {
      decorateBlock(nestedBlock);
      nestedBlockPromises.push(loadBlock(nestedBlock));
    });
  });

  await Promise.all(nestedBlockPromises);
}
