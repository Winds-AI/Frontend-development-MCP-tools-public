// devtools/element-capture.js
export function installElementCapture(sendToBrowserConnector) {
  function captureAndSendElement() {
    chrome.devtools.inspectedWindow.eval(
      `(function() {
        const el = $0;  // $0 is the currently selected element in DevTools
        if (!el) return null;

        const rect = el.getBoundingClientRect();
        const computedStyle = window.getComputedStyle(el);
        function getComputedStyles() {
          const importantStyles = [
            'display','position','top','right','bottom','left','width','height','min-width','min-height','max-width','max-height','margin','margin-top','margin-right','margin-bottom','margin-left','padding','padding-top','padding-right','padding-bottom','padding-left','border','border-width','border-style','border-color','background','background-color','background-image','color','font-size','font-family','font-weight','line-height','text-align','text-decoration','text-transform','overflow','overflow-x','overflow-y','white-space','flex-direction','flex-wrap','justify-content','align-items','align-content','flex-grow','flex-shrink','flex-basis','align-self','order','grid-template-columns','grid-template-rows','grid-gap','grid-area','z-index','opacity','visibility','cursor','pointer-events','transform','transition','animation'
          ];
          const styles = {};
          importantStyles.forEach(prop => {
            const value = computedStyle.getPropertyValue(prop);
            if (value && value !== 'auto' && value !== 'normal') {
              styles[prop] = value;
            }
          });
          return styles;
        }
        function getParentContext() {
          const parent = el.parentElement; if (!parent) return null;
          const parentStyle = window.getComputedStyle(parent);
          return { tagName: parent.tagName, className: parent.className, id: parent.id, display: parentStyle.display, flexDirection: parentStyle.flexDirection, gridTemplateColumns: parentStyle.gridTemplateColumns, isFlexContainer: parentStyle.display.includes('flex'), isGridContainer: parentStyle.display.includes('grid'), childrenCount: parent.children.length, position: parentStyle.position };
        }
        function getChildrenContext() {
          const children = Array.from(el.children); if (children.length === 0) return [];
          return children.slice(0, 5).map(child => { const childStyle = window.getComputedStyle(child); return { tagName: child.tagName, className: child.className, id: child.id, display: childStyle.display, position: childStyle.position, textContent: child.textContent ? child.textContent.substring(0, 50) : '' }; });
        }
        function getAccessibilityInfo() { return { role: el.getAttribute('role') || el.getAttribute('aria-role'), label: el.getAttribute('aria-label'), labelledBy: el.getAttribute('aria-labelledby'), describedBy: el.getAttribute('aria-describedby'), hidden: el.getAttribute('aria-hidden'), expanded: el.getAttribute('aria-expanded'), selected: el.getAttribute('aria-selected'), disabled: el.hasAttribute('disabled') || el.getAttribute('aria-disabled'), tabIndex: el.tabIndex, focusable: el.tabIndex >= 0 || ['INPUT','BUTTON','SELECT','TEXTAREA','A'].includes(el.tagName) }; }
        function getLayoutDebugInfo() {
          const issues = []; const suggestions = [];
          if (rect.width === 0 || rect.height === 0) { issues.push('Element has zero dimensions'); suggestions.push('Check if element has content or explicit dimensions'); }
          if (computedStyle.overflow === 'hidden' && el.scrollHeight > el.clientHeight) { issues.push('Content is being clipped by overflow:hidden'); suggestions.push('Consider using overflow:auto or increasing height'); }
          if (computedStyle.position === 'absolute' && (!computedStyle.top || !computedStyle.left)) { issues.push('Absolutely positioned element missing position values'); suggestions.push('Add top/left/right/bottom values for absolute positioning'); }
          const parent = el.parentElement; if (parent && window.getComputedStyle(parent).display.includes('flex')) { const flexGrow = computedStyle.flexGrow; const flexShrink = computedStyle.flexShrink; if (flexGrow === '0' && flexShrink === '1' && rect.width < 50) { issues.push('Flex item might be shrinking too much'); suggestions.push('Consider setting flex-shrink: 0 or min-width'); } }
          if (el.className && el.className.includes('Mui')) { if (computedStyle.boxSizing !== 'border-box') { suggestions.push('Material-UI components work best with box-sizing: border-box'); } }
          return { issues, suggestions, isFlexItem: parent && window.getComputedStyle(parent).display.includes('flex'), isGridItem: parent && window.getComputedStyle(parent).display.includes('grid'), isFlexContainer: computedStyle.display.includes('flex'), isGridContainer: computedStyle.display.includes('grid'), hasOverflow: el.scrollHeight > el.clientHeight || el.scrollWidth > el.clientWidth, isVisible: rect.width > 0 && rect.height > 0 && computedStyle.visibility !== 'hidden', isPositioned: ['absolute','relative','fixed','sticky'].includes(computedStyle.position) };
        }
        function getInteractiveState() { return { isHovered: el.matches(':hover'), isFocused: el.matches(':focus'), isActive: el.matches(':active'), isDisabled: el.matches(':disabled'), hasEventListeners: getEventListeners ? !!getEventListeners(el) : false, isClickable: ['BUTTON','A','INPUT'].includes(el.tagName) || el.hasAttribute('onclick') || computedStyle.cursor === 'pointer' }; }
        function getMaterialUIContext() {
          if (!el.className || !el.className.includes('Mui')) return null;
          const muiClasses = el.className.split(' ').filter(cls => cls.includes('Mui') || cls.includes('css-'));
          const component = muiClasses.find(cls => cls.startsWith('Mui'))?.replace('Mui','').split('-')[0];
          return { component, classes: muiClasses, variant: el.getAttribute('variant') || 'default', size: el.getAttribute('size') || 'medium', color: el.getAttribute('color') || 'default' };
        }
        return { tagName: el.tagName, id: el.id, className: el.className, textContent: el.textContent?.substring(0, 200), innerHTML: el.innerHTML.substring(0, 1000), attributes: Array.from(el.attributes).map(attr => ({ name: attr.name, value: attr.value })), dimensions: { width: rect.width, height: rect.height, top: rect.top, left: rect.left, right: rect.right, bottom: rect.bottom }, computedStyles: getComputedStyles(), parentContext: getParentContext(), childrenContext: getChildrenContext(), accessibility: getAccessibilityInfo(), layoutDebug: getLayoutDebugInfo(), interactiveState: getInteractiveState(), materialUI: getMaterialUIContext(), performanceHints: { hasLargeImage: Array.from(el.querySelectorAll('img')).some(img => img.naturalWidth > 2000 || img.naturalHeight > 2000), deepNesting: el.querySelectorAll('*').length > 50, manyChildren: el.children.length > 20 }, metadata: { timestamp: Date.now(), viewport: { width: window.innerWidth, height: window.innerHeight }, url: window.location.href, selector: (() => { let selector = el.tagName.toLowerCase(); if (el.id) selector += '#' + el.id; if (el.className) selector += '.' + el.className.split(' ').join('.'); return selector; })() } };
      })()`,
      (result, isException) => {
        if (isException || !result) return;
        sendToBrowserConnector({
          type: "selected-element",
          timestamp: Date.now(),
          element: result,
        });
      }
    );
  }
  chrome.devtools.panels.elements.onSelectionChanged.addListener(() => {
    captureAndSendElement();
  });
}
