import { useState, useCallback, useMemo } from 'react';
import { ALL_MEMORY_TYPES, ALL_ENTITY_TYPES } from '../lib/graphColors';

export function useGraphFilters(elements) {
  const [activeMemoryTypes, setActiveMemoryTypes] = useState(new Set(ALL_MEMORY_TYPES));
  const [activeEntityTypes, setActiveEntityTypes] = useState(new Set(ALL_ENTITY_TYPES));
  const [activeRelationTypes, setActiveRelationTypes] = useState(null); // null = all (initialized from data)
  const [cascadeEdgeFilter, setCascadeEdgeFilter] = useState(true); // hide nodes with no visible edges

  // Extract available types from actual data
  const availableTypes = useMemo(() => {
    const memoryTypes = new Set();
    const entityTypes = new Set();
    const relationTypes = new Set();

    for (const el of elements) {
      if (el.group === 'nodes') {
        const type = el.data.type;
        if (el.data.category === 'memory') memoryTypes.add(type);
        else if (el.data.category === 'entity') entityTypes.add(type);
      } else if (el.group === 'edges') {
        relationTypes.add(el.data.type);
      }
    }

    return {
      memoryTypes: Array.from(memoryTypes).sort(),
      entityTypes: Array.from(entityTypes).sort(),
      relationTypes: Array.from(relationTypes).sort(),
    };
  }, [elements]);

  // Compute visible node IDs based on active filters
  const visibleNodeIds = useMemo(() => {
    const ids = new Set();
    for (const el of elements) {
      if (el.group !== 'nodes') continue;
      const { type, category } = el.data;

      if (category === 'memory' && activeMemoryTypes.has(type)) {
        ids.add(el.data.id);
      } else if (category === 'entity' && activeEntityTypes.has(type)) {
        ids.add(el.data.id);
      }
    }
    return ids;
  }, [elements, activeMemoryTypes, activeEntityTypes]);

  const toggleMemoryType = useCallback((type) => {
    setActiveMemoryTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }, []);

  const toggleEntityType = useCallback((type) => {
    setActiveEntityTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }, []);

  const selectAllMemoryTypes = useCallback(() => {
    setActiveMemoryTypes(new Set(ALL_MEMORY_TYPES));
  }, []);

  const deselectAllMemoryTypes = useCallback(() => {
    setActiveMemoryTypes(new Set());
  }, []);

  const selectAllEntityTypes = useCallback(() => {
    setActiveEntityTypes(new Set(ALL_ENTITY_TYPES));
  }, []);

  const deselectAllEntityTypes = useCallback(() => {
    setActiveEntityTypes(new Set());
  }, []);

  // Initialize activeRelationTypes from data on first load
  const activeEdgeTypes = useMemo(() => {
    if (activeRelationTypes === null) {
      // null = all — return the full set from data
      return new Set(availableTypes.relationTypes);
    }
    return activeRelationTypes;
  }, [activeRelationTypes, availableTypes.relationTypes]);

  const toggleRelationType = useCallback((type) => {
    setActiveRelationTypes((prev) => {
      // If null (all), initialize from available and then remove the toggled one
      const current = prev === null ? new Set(availableTypes.relationTypes) : new Set(prev);
      if (current.has(type)) current.delete(type);
      else current.add(type);
      return current;
    });
  }, [availableTypes.relationTypes]);

  const selectAllRelationTypes = useCallback(() => {
    setActiveRelationTypes(null); // null = all
  }, []);

  const deselectAllRelationTypes = useCallback(() => {
    setActiveRelationTypes(new Set());
  }, []);

  return {
    activeMemoryTypes,
    activeEntityTypes,
    activeRelationTypes,
    activeEdgeTypes,
    availableTypes,
    visibleNodeIds,
    toggleMemoryType,
    toggleEntityType,
    toggleRelationType,
    setActiveRelationTypes,
    selectAllMemoryTypes,
    deselectAllMemoryTypes,
    selectAllEntityTypes,
    deselectAllEntityTypes,
    selectAllRelationTypes,
    deselectAllRelationTypes,
    cascadeEdgeFilter,
    toggleCascadeEdgeFilter: () => setCascadeEdgeFilter((prev) => !prev),
  };
}
