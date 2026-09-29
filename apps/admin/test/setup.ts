// jsdom doesn't implement scrolling; the router and Radix call it. A no-op keeps the test output
// free of "Not implemented: window.scrollTo" noise, so real warnings stand out.
window.scrollTo = () => {}
Element.prototype.scrollTo ??= () => {}
