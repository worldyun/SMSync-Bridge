const fs = require('fs');
const path = require('path');

class QueryLoader {
    static loadQueries(filename) {
        const content = fs.readFileSync(path.join(__dirname, 'sql', filename), 'utf8');
        const queries = {};
        let currentQueryName = '';
        let currentQuery = '';
        
        content.split('\n').forEach(line => {
            if (line.startsWith('-- ')) {
                // 保存上一个查询
                if (currentQueryName && currentQuery) {
                    queries[currentQueryName.trim()] = currentQuery.trim();
                }
                // 开始新的查询
                currentQueryName = line.substring(3);
                currentQuery = '';
            } else if (line.trim() !== '') {
                currentQuery += line + '\n';
            }
        });
        
        // 保存最后一个查询
        if (currentQueryName && currentQuery) {
            queries[currentQueryName.trim()] = currentQuery.trim();
        }
        
        return queries;
    }
}

module.exports = QueryLoader;