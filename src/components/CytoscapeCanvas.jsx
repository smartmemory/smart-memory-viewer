import { useEffect } from 'react';

export default function CytoscapeCanvas({ containerRef, onNodeClick, cy }) {
  // Wire up Cytoscape events
  useEffect(() => {
    const cyInstance = cy.current;
    if (!cyInstance) return;

    const handleTap = (evt) => {
      const node = evt.target;
      if (node !== cyInstance && node.isNode()) {
        onNodeClick(node.data());
      }
    };

    const handleBgTap = (evt) => {
      if (evt.target === cyInstance) {
        // Click on background — deselect
        cyInstance.elements().unselect();
        cyInstance.elements().removeClass('neighbor');
      }
    };

    cyInstance.on('tap', 'node', handleTap);
    cyInstance.on('tap', handleBgTap);

    return () => {
      cyInstance.off('tap', 'node', handleTap);
      cyInstance.off('tap', handleBgTap);
    };
  }, [cy, onNodeClick]);

  // Handle resize
  useEffect(() => {
    const cyInstance = cy.current;
    if (!cyInstance) return;

    const observer = new ResizeObserver(() => {
      cyInstance.resize();
    });

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, [cy, containerRef]);

  return (
    <div className="flex-1 relative">
      <div ref={containerRef} className="cytoscape-container absolute inset-0" />
    </div>
  );
}
