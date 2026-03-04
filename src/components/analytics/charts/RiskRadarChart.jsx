import {
  Chart as ChartJS,
  RadialLinearScale,
  PointElement,
  LineElement,
  Filler,
  Title,
  Tooltip,
  Legend,
} from 'chart.js'
import { Radar } from 'react-chartjs-2'
import { CHART_RED } from './analyticsColors'

ChartJS.register(RadialLinearScale, PointElement, LineElement, Filler, Title, Tooltip, Legend)

const LABELS = [
  'Delayed tasks %',
  'Critical faults %',
  'Critical inventory %',
  'Low worker efficiency %',
  'Overdue maintenance %',
]
const COLOR_RISK = CHART_RED
const COLOR_FILL = CHART_RED + '30'

const options = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } },
  },
  scales: {
    r: {
      beginAtZero: true,
      max: 100,
      ticks: { stepSize: 25, font: { size: 9 } },
      pointLabels: { font: { size: 10 } },
    },
  },
}

export default function RiskRadarChart({ data, onSegmentClick }) {
  const labels = data?.labels ?? LABELS
  const values = data?.values ?? [0, 0, 0, 0, 0]

  const chartData = {
    labels,
    datasets: [
      {
        label: 'System risk',
        data: values,
        borderColor: COLOR_RISK,
        backgroundColor: COLOR_FILL,
        pointBackgroundColor: COLOR_RISK,
      },
    ],
  }

  const optionsWithClick = {
    ...options,
    onClick: (event, elements, chart) => {
      if (!onSegmentClick || elements.length === 0) return
      const el = elements[0]
      onSegmentClick({ axisIndex: el.index })
    },
  }

  return <Radar data={chartData} options={optionsWithClick} />
}
