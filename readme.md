# build your own transit network

problem
- go transit sometimes publish schedules that are not ideal for commuters such as no express trains from mount pleasant & brampton go during peak hours
- ideal bus routes like 25W for laurier students, express to sq1 since 25C is always packed during rush hour

solution
- build your own system and see how it would play out with simulation style via machine learning

## Getting Started

### Installation

1.  Navigate to the `client` directory:
    ```bash
    cd client
    ```
2.  Install the dependencies:
    ```bash
    npm install
    ```

### Running the application

1.  Navigate to the `client` directory:
    ```bash
    cd client
    ```
2.  Start the development server:
    ```bash
    npm run dev
    ```
3. Open your browser and navigate to `http://localhost:3000/map` to see the application.

## GTFS subroute preprocessing

Generate route variants, lines, and ordered stops from a GTFS folder:

```bash
python3 scripts/build_subroutes.py --input_dir <path-to-gtfs> --output_dir <path-to-output>
```

Example:

```bash
python3 scripts/build_subroutes.py --input_dir client/public/gotransit --output_dir client/public/gotransit/derived
```
