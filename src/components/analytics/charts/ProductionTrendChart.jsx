import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Title,
  Tooltip,
  Legend,
} from 'chart.js'
import { Line } from 'react-chartjs-2'
import { INV_GREEN } from './analyticsColors'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Title, Tooltip, Legend)

const COLOR_LINE = INV_GREEN
const COLOR_FILL = INV_GREEN + '20'

const options = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } },
  },
  scales: {
    x: {
      grid: { display: false },
      ticks: { maxRotation: 45, font: { size: 10 } },
    },
    y: {
      beginAtZero: true,
      grid: { color: 'rgba(0,0,0,0.06)' },
      ticks: { font: { size: 10 } },
    },
  },
}

export default function ProductionTrendChart({ data, onSegmentClick }) {
  const dates = data?.dates ?? []
  const values = data?.values ?? []

  const chartData = {
    labels: dates.length ? dates : ['No data'],
    datasets: [
      {
        label: 'Production',
        data: values.length ? values : [0],
        borderColor: COLOR_LINE,
        backgroundColor: COLOR_FILL,
        fill: true,
        tension: 0.3,
      },
    ],
  }

  const optionsWithClick = {
    ...options,
    onClick: (event, elements, chart) => {
      if (!onSegmentClick || elements.length === 0) return
      const el = elements[0]
      const date = chart.scales.x.getLabelForValue(el.index)
      if (date) onSegmentClick({ date, dateIndex: el.index })
    },
  }

  return <Line data={chartData} options={optionsWithClick} />
}
