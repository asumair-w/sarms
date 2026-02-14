import { useEffect, useRef, useState } from 'react'

const DEFAULT_COLOR = '#5c7b5c'
const MARGIN = { top: 20, right: 20, bottom: 40, left: 45 }
const BAR_PADDING = 0.2

/**
 * D3.js bar chart. Data: [{ label, value }]. Loads D3 dynamically to avoid blocking the app.
 */
export default function D3BarChart({ data = [], maxValue: maxValueProp, title = '', color = DEFAULT_COLOR }) {
  const svgRef = useRef(null)
  const containerRef = useRef(null)
  const [containerWidth, setContainerWidth] = useState(280)
  const mountedRef = useRef(true)
  const [d3Error, setD3Error] = useState(false)
  const [d3Ready, setD3Ready] = useState(false)

  useEffect(() => {
    mountedRef.current = true
    const el = containerRef.current
    if (!el) return () => { mountedRef.current = false }
    const ro = new ResizeObserver(() => {
      if (mountedRef.current && el) setContainerWidth(el.clientWidth || 280)
    })
    ro.observe(el)
    return () => {
      mountedRef.current = false
      ro.disconnect()
    }
  }, [])

  useEffect(() => {
    if (!data.length || d3Error) return

    let cancelled = false
    let id
    import('d3').then((d3) => {
      if (cancelled) return
      id = requestAnimationFrame(() => {
        if (cancelled || !containerRef.current || !svgRef.current) return
        try {
          const width = Math.max(containerWidth, 200)
          const height = 220
          const innerWidth = Math.max(0, width - MARGIN.left - MARGIN.right)
          const innerHeight = Math.max(0, height - MARGIN.top - MARGIN.bottom)
          const maxVal = Math.max(maxValueProp ?? 1, ...data.map((d) => d.value), 1)

          d3.select(svgRef.current).selectAll('*').remove()

          const svg = d3
            .select(svgRef.current)
            .attr('width', width)
            .attr('height', height)
            .attr('viewBox', [0, 0, width, height])

          const g = svg.append('g').attr('transform', `translate(${MARGIN.left},${MARGIN.top})`)

          const xScale = d3
            .scaleBand()
            .domain(data.map((d) => d.label))
            .range([0, innerWidth])
            .padding(BAR_PADDING)

          const yScale = d3
            .scaleLinear()
            .domain([0, maxVal])
            .range([innerHeight, 0])
            .nice()

          const xAxis = d3.axisBottom(xScale).tickSizeOuter(0)
          const yAxis = d3.axisLeft(yScale).ticks(5).tickSizeOuter(0)

          g.append('g')
            .attr('transform', `translate(0,${innerHeight})`)
            .call(xAxis)
            .selectAll('text')
            .attr('transform', 'rotate(-35)')
            .style('text-anchor', 'end')
            .style('font-size', '10px')
            .style('fill', '#64748b')

          g.append('g')
            .call(yAxis)
            .style('font-size', '10px')
            .style('color', '#64748b')

          let hoverColor = color
          try {
            const col = d3.color(color)
            if (col) hoverColor = col.brighter(0.4).formatHex()
          } catch (_) {}

          g.selectAll('.bar')
            .data(data)
            .join('rect')
            .attr('class', 'bar')
            .attr('x', (d) => xScale(d.label))
            .attr('y', (d) => yScale(d.value))
            .attr('width', xScale.bandwidth())
            .attr('height', (d) => Math.max(0, innerHeight - yScale(d.value)))
            .attr('fill', color)
            .attr('rx', 4)
            .attr('ry', 4)
            .style('transition', 'fill 0.2s')
            .on('mouseenter', function () {
              d3.select(this).attr('fill', hoverColor)
            })
            .on('mouseleave', function () {
              d3.select(this).attr('fill', color)
            })

          g.selectAll('.bar-value')
            .data(data)
            .join('text')
            .attr('class', 'bar-value')
            .attr('x', (d) => xScale(d.label) + xScale.bandwidth() / 2)
            .attr('y', (d) => yScale(d.value) - 6)
            .attr('text-anchor', 'middle')
            .attr('fill', '#334155')
            .style('font-size', '11px')
            .style('font-weight', '600')
            .text((d) => d.value)
          if (mountedRef.current) setD3Ready(true)
        } catch (err) {
          console.error('D3BarChart error:', err)
          if (mountedRef.current) setD3Error(true)
        }
      })
    }).catch((err) => {
      console.error('D3 load error:', err)
      if (mountedRef.current) setD3Error(true)
    })

    return () => {
      cancelled = true
      if (id) cancelAnimationFrame(id)
    }
  }, [data, maxValueProp, color, containerWidth, d3Error])

  if (data.length === 0) {
    return (
      <div className="d3-chart-empty" style={{ padding: '1rem', textAlign: 'center', color: '#64748b', minHeight: 200 }}>
        {title && <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>{title}</div>}
        No data
      </div>
    )
  }

  if (d3Error) {
    return (
      <div style={{ width: '100%', minHeight: 200 }}>
        {title && <div style={{ marginBottom: '0.5rem', fontWeight: 600, fontSize: '0.9rem', color: '#334155' }}>{title}</div>}
        <div style={{ padding: '1rem', background: '#f8fafc', borderRadius: 8, fontSize: '0.9rem', color: '#64748b' }}>
          {data.map((d, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span>{d.label}</span>
              <strong style={{ color: '#334155' }}>{d.value}</strong>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div ref={containerRef} style={{ width: '100%', minHeight: 220 }}>
      {title && (
        <div style={{ marginBottom: '0.5rem', fontWeight: 600, fontSize: '0.9rem', color: '#334155' }}>{title}</div>
      )}
      {!d3Ready && !d3Error && (
        <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: '0.9rem' }}>
          Loading chart…
        </div>
      )}
      <svg ref={svgRef} style={{ display: d3Ready ? 'block' : 'none', overflow: 'visible' }} />
    </div>
  )
}
