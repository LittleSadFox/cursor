import { HomeCharts } from './charts.js';
import { TodayEntryForm } from './today-form.js';

export function HomePage() {
  return (
    <div className="home">
      <TodayEntryForm />
      <HomeCharts />
    </div>
  );
}
