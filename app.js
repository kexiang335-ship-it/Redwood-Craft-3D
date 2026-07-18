import {
  createProductLoader,
  deferProductLoadUntilViewerIsReady,
  normalizeCatalog,
  shouldLoadAnalytics
} from './app-core.js';

const ANALYTICS_CONSENT_KEY = 'redwood-analytics-consent';
const ANALYTICS_URL = 'https://hm.baidu.com/hm.js?442c96f6426d44ac0b412e638323f7e5';

function getStoredConsent() {
  try {
    return window.localStorage.getItem(ANALYTICS_CONSENT_KEY);
  } catch {
    return null;
  }
}

function storeConsent(consent) {
  try {
    window.localStorage.setItem(ANALYTICS_CONSENT_KEY, consent);
  } catch {
    // The banner remains useful even when browser storage is unavailable.
  }
}

function loadAnalytics() {
  if (document.querySelector('script[data-analytics="baidu"]')) return;

  window._hmt = window._hmt || [];
  const script = document.createElement('script');
  script.async = true;
  script.src = ANALYTICS_URL;
  script.dataset.analytics = 'baidu';
  document.head.appendChild(script);
}

function initializeAnalyticsConsent() {
  const banner = document.getElementById('analytics-consent');
  const acceptButton = document.getElementById('analytics-accept');
  const rejectButton = document.getElementById('analytics-reject');
  const consent = getStoredConsent();

  if (shouldLoadAnalytics(consent)) loadAnalytics();
  if (consent) banner.hidden = true;

  acceptButton.addEventListener('click', () => {
    storeConsent('accepted');
    banner.hidden = true;
    loadAnalytics();
  });

  rejectButton.addEventListener('click', () => {
    storeConsent('rejected');
    banner.hidden = true;
  });
}

async function fetchCatalog() {
  const response = await fetch('./products/catalog.json');
  if (!response.ok) throw new Error(`Catalog returned ${response.status}`);
  return normalizeCatalog(await response.json());
}

async function initializeApp() {
  const menuContainer = document.getElementById('catalog-menu');
  const sidebar = document.getElementById('sidebar-left');
  const menuToggle = document.getElementById('menu-toggle');
  const menuBackdrop = document.getElementById('menu-backdrop');
  const viewer = document.getElementById('main-viewer');
  const modelStatus = document.getElementById('model-status');
  const nameElement = document.getElementById('display-name');
  const priceElement = document.getElementById('display-price');
  const descriptionElement = document.getElementById('display-desc');
  const productStatus = document.getElementById('product-status');
  const wechatToggle = document.getElementById('wechat-toggle');
  const wechatQr = document.getElementById('wechat-qr');
  const wechatImage = document.getElementById('wechat-image');
  const mobileQuery = window.matchMedia('(max-width: 900px)');
  let isMenuOpen = false;

  function setModelStatus(message, isError = false) {
    modelStatus.textContent = message;
    modelStatus.hidden = false;
    modelStatus.classList.toggle('is-error', isError);
  }

  function setProductLoading() {
    nameElement.textContent = '正在加载信息…';
    priceElement.textContent = '';
    descriptionElement.textContent = '';
    productStatus.textContent = '正在加载产品信息';
  }

  function setProductReady(product) {
    nameElement.textContent = product.name;
    priceElement.textContent = product.price;
    descriptionElement.textContent = product.description;
    document.title = `${product.name} | 雨山红木`;
    document.querySelector('meta[name="description"]').content = product.description.slice(0, 150);
    document.querySelector('meta[property="og:title"]').content = `${product.name} | 雨山红木`;
    document.querySelector('meta[property="og:description"]').content = product.description.slice(0, 150);
    productStatus.textContent = '产品信息已加载';
  }

  function setProductError(message) {
    nameElement.textContent = '暂未能加载产品信息';
    priceElement.textContent = '';
    descriptionElement.textContent = message;
    productStatus.textContent = message;
  }

  const loadProduct = createProductLoader({
    fetchProduct: async (infoUrl, options) => {
      const response = await fetch(infoUrl, options);
      if (!response.ok) throw new Error(`Product metadata returned ${response.status}`);
      return response.json();
    },
    onModelLoading: (modelUrl) => {
      setProductLoading();
      viewer.setAttribute('aria-busy', 'true');
      setModelStatus('正在加载 3D 模型…');
      // Attribute assignment is retained through custom-element upgrades;
      // property assignment can be lost if the module registration races.
      viewer.setAttribute('src', modelUrl);
    },
    onProductReady: setProductReady,
    onProductError: setProductError
  });
  const loadProductWhenViewerIsReady = deferProductLoadUntilViewerIsReady(
    customElements.whenDefined('model-viewer'),
    loadProduct
  );

  function updateMenuAccessibility() {
    const isMobile = mobileQuery.matches;
    if (!isMobile) isMenuOpen = false;

    sidebar.classList.toggle('open', isMobile && isMenuOpen);
    sidebar.setAttribute('aria-hidden', String(isMobile && !isMenuOpen));
    sidebar.inert = isMobile && !isMenuOpen;
    menuToggle.setAttribute('aria-expanded', String(isMobile && isMenuOpen));
    menuBackdrop.hidden = !isMobile || !isMenuOpen;
  }

  function closeMenu() {
    if (!mobileQuery.matches || !isMenuOpen) return;
    isMenuOpen = false;
    updateMenuAccessibility();
    menuToggle.focus();
  }

  function toggleMenu() {
    isMenuOpen = !isMenuOpen;
    updateMenuAccessibility();
    if (isMenuOpen) {
      window.requestAnimationFrame(() => sidebar.querySelector('.category-title:not([disabled])')?.focus());
    }
  }

  function toggleWechat() {
    const willOpen = wechatQr.hidden;
    wechatQr.hidden = !willOpen;
    wechatToggle.setAttribute('aria-expanded', String(willOpen));
    if (willOpen && !wechatImage.src) wechatImage.src = wechatImage.dataset.src;
  }

  function selectProduct(button, categoryFolder, productFolder) {
    document.querySelectorAll('.product-item[aria-current="true"]')
      .forEach((item) => item.removeAttribute('aria-current'));
    button.setAttribute('aria-current', 'true');
    const selection = `${categoryFolder}/${productFolder}`;
    const url = new URL(window.location.href);
    url.searchParams.set('product', selection);
    window.history.replaceState(null, '', `${url.pathname}${url.search}`);
    void loadProductWhenViewerIsReady(categoryFolder, productFolder);
    closeMenu();
  }

  function renderCatalog(catalog) {
    catalog.forEach((category, categoryIndex) => {
      const group = document.createElement('section');
      group.className = 'category-group';

      const title = document.createElement('button');
      const listId = `product-list-${categoryIndex}`;
      const hasItems = category.items.length > 0;
      title.type = 'button';
      title.className = 'category-title';
      title.textContent = category.categoryName;
      title.setAttribute('aria-controls', listId);
      title.setAttribute('aria-expanded', 'false');
      title.disabled = !hasItems;
      if (!hasItems) title.title = '暂无商品';

      const list = document.createElement('ul');
      list.id = listId;
      list.className = 'product-list';
      list.hidden = true;

      title.addEventListener('click', () => {
        const shouldOpen = list.hidden;
        document.querySelectorAll('.product-list').forEach((element) => { element.hidden = true; });
        document.querySelectorAll('.category-title').forEach((element) => {
          element.classList.remove('active');
          element.setAttribute('aria-expanded', 'false');
        });
        list.hidden = !shouldOpen;
        title.classList.toggle('active', shouldOpen);
        title.setAttribute('aria-expanded', String(shouldOpen));
      });

      category.items.forEach((item) => {
        const listItem = document.createElement('li');
        const itemButton = document.createElement('button');
        itemButton.type = 'button';
        itemButton.className = 'product-item';
        itemButton.textContent = item.name;
        itemButton.dataset.product = `${category.categoryFolder}/${item.folder}`;
        itemButton.addEventListener('click', () => selectProduct(itemButton, category.categoryFolder, item.folder));
        listItem.appendChild(itemButton);
        list.appendChild(listItem);
      });

      group.append(title, list);
      menuContainer.appendChild(group);
    });
  }

  viewer.addEventListener('load', () => {
    viewer.setAttribute('aria-busy', 'false');
    modelStatus.hidden = true;
  });
  viewer.addEventListener('error', () => {
    viewer.setAttribute('aria-busy', 'false');
    setModelStatus('3D 模型加载失败，请检查网络后重试。', true);
  });
  window.addEventListener('load', () => {
    window.setTimeout(() => {
      if (!customElements.get('model-viewer')) {
        setModelStatus('3D 查看器未能启动，请刷新页面或稍后重试。', true);
      }
    }, 0);
  });
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeMenu();
  });
  mobileQuery.addEventListener('change', updateMenuAccessibility);
  menuToggle.addEventListener('click', toggleMenu);
  menuBackdrop.addEventListener('click', closeMenu);
  wechatToggle.addEventListener('click', toggleWechat);

  updateMenuAccessibility();
  initializeAnalyticsConsent();

  let catalog;
  try {
    catalog = await fetchCatalog();
  } catch {
    setProductError('商品目录加载失败，请稍后重试。');
    setModelStatus('商品目录加载失败，请刷新页面后重试。', true);
    return;
  }
  renderCatalog(catalog);

  const requestedProduct = new URLSearchParams(window.location.search).get('product');
  const requestedButton = Array.from(menuContainer.querySelectorAll('[data-product]'))
    .find((button) => button.dataset.product === requestedProduct);
  if (requestedButton) {
    const [categoryFolder, productFolder] = requestedProduct.split('/');
    selectProduct(requestedButton, categoryFolder, productFolder);
  }
}

document.addEventListener('DOMContentLoaded', initializeApp);
