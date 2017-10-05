import { Observable } from 'rxjs/Observable';

module.exports = function () {
  return {
    never (source$) {
      return source$;
    },

    always (source$, options, args) {
      const params = args[0] || {};
      const query = Object.assign({}, params.query);

      // A function that returns if an item matches the query
      const matches = options.matcher(query);

      const events$ = Observable.merge(
        this.created$.filter(matches),
        this.removed$,
        this.updated$,
        this.patched$
      );

      return source$
        .concat(
          events$.concatMapTo(source$)
        );
    },

    smart (source$, options, args) {
      const params = args[0] || {};
      const query = Object.assign({}, params.query);
      // A function that returns if an item matches the query
      const matches = options.matcher(query);
      // A function that sorts a limits a result (paginated or not)
      const sortAndTrim = options.sorter(query, options);
      const onCreated = eventData => {
        return page => {
          const isPaginated = !!page[options.dataField];
          const process = data => data.concat(eventData);

          if (isPaginated) {
            return Object.assign({}, page, {
              total: page.total + 1,
              [options.dataField]: process(page[options.dataField])
            });
          }

          return process(page);
        };
      };
      const onRemoved = eventData => {
        return page => {
          const isPaginated = !!page[options.dataField];
          const process = data => data.filter(current =>
            eventData[options.idField] !== current[options.idField]
          );

          if (isPaginated) {
            return Object.assign({}, page, {
              total: matches(eventData) ? page.total - 1 : page.total,
              [options.dataField]: process(page[options.dataField])
            });
          }

          return process(page);
        };
      };
      const onUpdated = eventData => {
        return page => {
          const isPaginated = !!page[options.dataField];
          const length = isPaginated ? page[options.dataField].length : page.length;
          const process = data =>
            data.filter(current =>
              eventData[options.idField] !== current[options.idField]
            ).concat(eventData).filter(matches);

          if (isPaginated) {
            const processed = process(page[options.dataField]);
            return Object.assign({}, page, {
              // Total can be either decreased or increased based
              // on if the update removed or added the item to the list
              total: page.total - (length - processed.length),
              [options.dataField]: processed
            });
          }

          return process(page);
        };
      };

      const events$ = Observable.merge(
        this.created$.filter(matches).map(onCreated),
        this.removed$.map(onRemoved),
        Observable.merge(this.updated$, this.patched$).map(onUpdated)
      );

      return source$
        .concatMap(data =>
          Observable.of(data)
            .concat(events$.scan((current, callback) => sortAndTrim(callback(current)), data))
        );
    }
  };
};
