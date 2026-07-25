import React, { useRef, useEffect } from 'react';
import * as d3 from 'd3';

interface DataPoint {
  g: number;
  time: number;
  id: number;
}

interface Props {
  data: DataPoint[];
}

export const GForceScatterPlot: React.FC<Props> = ({ data }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const width = containerRef.current.clientWidth || 300;
    const height = containerRef.current.clientHeight || 150;
    const margin = { top: 10, right: 10, bottom: 20, left: 30 };
    
    // Clear previous SVG
    d3.select(containerRef.current).selectAll('*').remove();

    const svg = d3.select(containerRef.current)
      .append('svg')
      .attr('width', width)
      .attr('height', height);

    const now = Date.now();
    const timeDomain = [now - 60000, now];
    
    const maxG = Math.max(5, d3.max(data, d => d.g) || 0);

    const xScale = d3.scaleTime()
      .domain(timeDomain)
      .range([margin.left, width - margin.right]);

    const yScale = d3.scaleLinear()
      .domain([0, maxG * 1.2]) // Give some padding at the top
      .range([height - margin.bottom, margin.top]);

    const colorScale = d3.scaleSequential(d3.interpolateYlOrRd)
      .domain([0, 10]);

    // Add X axis
    const xAxis = d3.axisBottom(xScale)
      .ticks(5)
      .tickFormat(d => d3.timeFormat('%H:%M:%S')(d as Date));
      
    svg.append('g')
      .attr('transform', `translate(0,${height - margin.bottom})`)
      .call(xAxis)
      .attr('color', '#64748b')
      .selectAll('text')
      .style('font-size', '10px')
      .style('font-family', 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace');

    // Add Y axis
    const yAxis = d3.axisLeft(yScale)
      .ticks(5);

    svg.append('g')
      .attr('transform', `translate(${margin.left},0)`)
      .call(yAxis)
      .attr('color', '#64748b')
      .selectAll('text')
      .style('font-size', '10px')
      .style('font-family', 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace');

    // Grid lines
    svg.append('g')
      .attr('class', 'grid')
      .attr('transform', `translate(0,${height - margin.bottom})`)
      .call(d3.axisBottom(xScale).ticks(5).tickSize(-height + margin.top + margin.bottom).tickFormat(() => ''))
      .attr('color', '#1e293b')
      .attr('stroke-dasharray', '3,3');

    svg.append('g')
      .attr('class', 'grid')
      .attr('transform', `translate(${margin.left},0)`)
      .call(d3.axisLeft(yScale).ticks(5).tickSize(-width + margin.left + margin.right).tickFormat(() => ''))
      .attr('color', '#1e293b')
      .attr('stroke-dasharray', '3,3');

    // Scatter points
    svg.append('g')
      .selectAll('circle')
      .data(data)
      .enter()
      .append('circle')
      .attr('cx', d => xScale(d.time))
      .attr('cy', d => yScale(d.g))
      .attr('r', d => Math.max(3, d.g * 1.5))
      .attr('fill', d => colorScale(d.g) as string)
      .attr('opacity', 0.8)
      .attr('stroke', '#0f172a')
      .attr('stroke-width', 1);
      
    // Remove axes paths
    svg.selectAll('.domain').remove();
    
  }, [data]);

  return (
    <div ref={containerRef} className="w-full h-full min-h-[150px]" />
  );
};
